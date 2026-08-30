"""影响检索（DRF-FR-003/004 / PRD §6.2，步骤06.2）。

多通道召回 + 合并去重 + 逐项解释：
- 业务键通道：Diff 文本 ↔ 规则/参数业务键与定义文本；
- 参数引用通道：受影响参数 ↔ 引用它的规则（parameterRefs）；
- 测试通道：受影响规则 ↔ 关联测试（ruleId）；
- RAG 通道：语义相关候选（仅提供证据，不单独决定影响）。
每个 ImpactItem 携带实体、影响类型、置信度、解释与引用（Diff 条目）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from agent.drafting.diff import DiffEntry


@dataclass
class CoreEntity:
    entity_type: str  # rule|param|test
    key: str
    text: str  # 定义摘要（decision table/param value/测试名）
    param_refs: list[str] = field(default_factory=list)
    rule_refs: list[str] = field(default_factory=list)  # 测试 → 覆盖的规则


@dataclass
class ImpactItem:
    entity_type: str
    entity_key: str
    impact_type: str  # modified|added|removed|review
    confidence: float
    explanation: str
    citations: list[dict[str, Any]] = field(default_factory=list)
    channels: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "entity_type": self.entity_type,
            "entity_key": self.entity_key,
            "impact_type": self.impact_type,
            "confidence": round(self.confidence, 4),
            "explanation": self.explanation,
            "citations": self.citations,
            "channels": self.channels,
        }


def _entity_text(e: CoreEntity) -> str:
    return f"{e.key} {e.text}"


def find_impacted_entities(
    diff_entries: list[DiffEntry],
    core_entities: list[CoreEntity],
    rag_evidence: dict[str, list[str]] | None = None,
) -> list[ImpactItem]:
    """确定性通道优先，RAG 通道仅补充证据。返回去重后的 ImpactItem 列表。"""
    rag_evidence = rag_evidence or {}
    impacts: dict[tuple[str, str], ImpactItem] = {}

    def add_impact(e: CoreEntity, impact_type: str, confidence: float, explanation: str, citation: dict, channel: str) -> None:
        key = (e.entity_type, e.key)
        item = impacts.get(key)
        if item:
            item.confidence = min(1.0, item.confidence + confidence * 0.25)
            if channel not in item.channels:
                item.channels.append(channel)
            if citation not in item.citations:
                item.citations.append(citation)
        else:
            impacts[key] = ImpactItem(
                entity_type=e.entity_type,
                entity_key=e.key,
                impact_type=impact_type,
                confidence=confidence,
                explanation=explanation,
                citations=[citation],
                channels=[channel],
            )

    def citation_of(entry: DiffEntry) -> dict[str, Any]:
        return {
            "kind": entry.kind,
            "path_old": entry.path_old,
            "path_new": entry.path_new,
            "text_old": (entry.text_old or "")[:80],
            "text_new": (entry.text_new or "")[:80],
        }

    rules = [e for e in core_entities if e.entity_type == "rule"]
    params = [e for e in core_entities if e.entity_type == "param"]
    tests = [e for e in core_entities if e.entity_type == "test"]

    for entry in diff_entries:
        diff_text = f"{entry.text_old or ''} {entry.text_new or ''}"
        citation = citation_of(entry)

        # 参数通道：参数名 token 或参数数值出现在 Diff 文本中。
        for p in params:
            pkey = p.key.split(":")[-1] if ":" in p.key else p.key
            tokens = [t for t in pkey.replace("P-", "").split("-") if len(t) >= 2]
            numbers = re.findall(r"\d[\d,]*(?:\.\d+)?", p.text or "")
            hit = (
                any(t in diff_text for t in tokens)
                or (p.text and p.text[:12] in diff_text)
                or any(n and n in diff_text for n in numbers)
            )
            if hit:
                add_impact(
                    p,
                    "modified" if entry.kind in ("modified", "moved") else "review",
                    0.8,
                    f"参数 {p.key} 的取值/定义主题出现在政策变化条目中（{entry.kind}）",
                    citation,
                    "business-key",
                )

        # 规则通道：规则定义文本与 Diff 文本词面重叠。
        for r in rules:
            rule_text = _entity_text(r)
            overlap = sum(1 for token in set(_tokens(diff_text)) if token in _tokens(rule_text))
            if overlap >= 2:
                add_impact(
                    r,
                    "modified" if entry.kind in ("modified", "moved") else "review",
                    min(0.95, 0.5 + overlap * 0.1),
                    f"规则定义与政策变化条目有 {overlap} 个关键词重叠（{entry.kind}）",
                    citation,
                    "definition-overlap",
                )

        # 受影响参数 → 引用它的规则（确定性依赖）。
        impacted_params = [i for (t, _), i in impacts.items() if t == "param"]
        for p in params:
            if any((p.key, "param") in [(i.entity_key, "param") for i in impacts.values()] for _ in [0]) and False:
                continue
        impacted_param_keys = {i.entity_key for (t, _), i in impacts.items() if t == "param"}
        for r in rules:
            refs_hit = [ref for ref in r.param_refs if ref in impacted_param_keys]
            if refs_hit:
                add_impact(
                    r,
                    "modified",
                    0.9,
                    f"规则引用了受影响参数 {refs_hit}",
                    citation,
                    "parameter-ref",
                )

    # 测试通道：受影响规则 → 关联测试（rule_refs 确定性链接）。
    impacted_rule_keys = {i.entity_key for (t, _), i in impacts.items() if t == "rule"}
    impacted_param_keys = {i.entity_key for (t, _), i in impacts.items() if t == "param"}
    for t in tests:
        matched = [k for k in impacted_rule_keys if k in t.rule_refs or k in t.key or k in t.text]
        if not matched:
            # 参数键的主题片段（如 MIN-WAGE）出现在测试名中。
            for param_key in impacted_param_keys:
                suffix = param_key.split("-", 1)[-1] if "-" in param_key else param_key
                if suffix and suffix in t.key:
                    matched.append(param_key)
                    break
        if matched:
            add_impact(
                t,
                "modified",
                0.85,
                f"测试覆盖受影响对象 {matched}",
                citation,
                "test-rule-ref",
            )

    # RAG 通道：语义候选仅补充 review 证据。
    for entity_key, evidence_texts in (rag_evidence or {}).items():
        for e in core_entities:
            if e.key == entity_key:
                add_impact(
                    e,
                    "review",
                    0.4,
                    f"RAG 语义候选（证据 {len(evidence_texts)} 条）",
                    {"rag_evidence": evidence_texts[:3]},
                    "rag",
                )

    return sorted(impacts.values(), key=lambda i: -i.confidence)


def _tokens(text: str) -> set[str]:
    import jieba

    return {t for t in jieba.cut_for_search(text) if len(t) >= 2}
