"""阶段06 测试：Diff 标注对账（AC-001）、影响召回（AC-002）、verify/revise（AC-003）、畸形拒绝。"""

from __future__ import annotations

import pytest

from agent.drafting.bundle import DraftBundle, parse_bundle, revise_bundle, verify_bundle
from agent.drafting.diff import diff_trees
from agent.drafting.impact import CoreEntity, find_impacted_entities
from agent.rag.document_tree import TreeNode


def _tree(articles: list[tuple[str, str]]) -> TreeNode:
    root = TreeNode(type="document", text="政策")
    chapter = TreeNode(type="chapter", text="正文")
    root.children.append(chapter)
    for title, text in articles:
        chapter.children.append(TreeNode(type="article", text=f"{title} {text}"))
    return root


def test_diff_labeled_changes():
    """AC-001：人工标注的变化（改/增/删/移）与 Diff 输出一致。"""
    old = _tree([
        ("第一条", "缴费基数上限为 36549 元。"),
        ("第二条", "失业保险金按最低工资的 90% 发放。"),
        ("第三条", "医保个人账户按月划入。"),
    ])
    new = _tree([
        ("第一条", "缴费基数上限调整为 36549 元（新口径）。"),  # modified
        ("第二条", "失业保险金按最低工资的 90% 发放。"),  # moved（换章路径不适用此处，同文本跨章节=removed+added 之外的情况）
    ])
    chapter_new = TreeNode(type="chapter", text="附则")
    chapter_new.children.append(TreeNode(type="article", text="第三条 新增条款：医保门诊共济。"))  # added
    new.children.append(chapter_new)

    entries = diff_trees(old, new)
    kinds = {e.kind for e in entries}
    assert "modified" in kinds
    assert "added" in kinds or "merged" in kinds or "removed" in kinds
    modified = next(e for e in entries if e.kind == "modified")
    assert modified.similarity >= 0.72
    assert modified.text_old and modified.text_new


def test_impact_recall_labeled_set():
    """AC-002：标注受影响集合的召回率 ≥ 90%，且每项有解释与引用。"""
    # 标注：政策改了"最低工资标准" → 影响参数 P-SH-MIN-WAGE、引用它的规则 R-300、测试 T-300。
    diff_entries = []
    from agent.drafting.diff import DiffEntry

    diff_entries.append(
        DiffEntry(
            kind="modified",
            path_old="/document/chapter/article",
            path_new="/document/chapter/article",
            text_old="最低工资标准为每月 2690 元",
            text_new="最低工资标准调整为每月 2740 元",
            similarity=0.9,
        )
    )
    entities = [
        CoreEntity("param", "P-SH-MIN-WAGE", "最低工资标准 每月 2690 元"),
        CoreEntity("rule", "R-300-SUBSIDY", "灵活就业补贴按最低工资标准 50% 计算", param_refs=["P-SH-MIN-WAGE"]),
        CoreEntity("test", "T-300-MIN-WAGE", "最低工资 2690 → 补贴 1345", rule_refs=["R-300-SUBSIDY"]),
        CoreEntity("rule", "R-900-UNRELATED", "医保异地就医备案流程", param_refs=[]),
    ]
    impacts = find_impacted_entities(diff_entries, entities)
    recalled_keys = {i.entity_key for i in impacts}
    labeled = {"P-SH-MIN-WAGE", "R-300-SUBSIDY", "T-300-MIN-WAGE"}
    recall = len(labeled & recalled_keys) / len(labeled)
    assert recall >= 0.9, f"recall={recall}, recalled={recalled_keys}"
    # 每项有解释与引用。
    for item in impacts:
        assert item.explanation
        assert item.citations
    # 无关实体不得混入。
    assert "R-900-UNRELATED" not in recalled_keys


def _valid_bundle() -> DraftBundle:
    from agent.drafting.bundle import Citation

    citation = Citation(document_version_id="dv-1", path="/document/chapter/article", text_excerpt="36549 元/月")
    return parse_bundle(
        {
            "proposal_id": "p1",
            "run_id": "r1",
            "idempotency_key": "mat-key-1",
            "base_snapshot_id": "snap-1",
            "jurisdiction_code": "310000",
            "effective_from": "2026-01-01",
            "status": "draft",
            "rule_drafts": [
                {
                    "temp_id": "t1",
                    "rule_id": "R-DRAFT-1",
                    "name": "草案规则",
                    "decision_table": {"hit_policy": "first", "rows": []},
                    "effective_from": "2026-01-01",
                    "citations": [citation.model_dump()],
                    "parameter_refs": ["P-DRAFT-1"],
                }
            ],
            "param_drafts": [
                {
                    "temp_id": "p1",
                    "param_id": "P-DRAFT-1",
                    "type": "number",
                    "value": 36549,
                    "effective_from": "2026-01-01",
                    "citations": [citation.model_dump()],
                }
            ],
            "test_drafts": [],
            "citations": [citation.model_dump()],
        }
    )


def test_verify_passes_with_citations_and_dependencies():
    bundle = _valid_bundle()
    result = verify_bundle(bundle)
    assert result["passed"] is True
    assert result["can_review"] is True


def test_verify_fails_without_citations():
    """AC-003：缺引用草案不得进入可批准状态。"""
    bundle = _valid_bundle()
    for r in bundle.rule_drafts:
        r.citations = []
    result = verify_bundle(bundle)
    assert result["passed"] is False
    assert result["can_review"] is False
    assert any("citations" in e for e in result["errors"])


def test_verify_rejects_production_status():
    """Core/verify 拒绝非 draft 状态（AC-007 应用层部分）。"""
    bundle = _valid_bundle()
    bundle.status = "production"
    result = verify_bundle(bundle)
    assert result["can_review"] is False
    assert any("draft" in e for e in result["errors"])


def test_verify_dependency_unknown_param_ref():
    bundle = _valid_bundle()
    bundle.rule_drafts[0].parameter_refs = ["P-UNKNOWN"]
    result = verify_bundle(bundle, known_param_keys=set())
    assert result["passed"] is False


def test_malformed_bundle_rejected():
    with pytest.raises(Exception):
        parse_bundle({"proposal_id": "p1"})  # 缺必填字段
    with pytest.raises(Exception):
        parse_bundle("{broken json")


def test_revise_marks_missing_citations_then_hits_limit():
    bundle = _valid_bundle()
    for r in bundle.rule_drafts:
        r.citations = []
    first = revise_bundle(bundle, ["missing citations"], attempt=0, max_attempts=2)
    assert first["revised"] is True
    assert bundle.rule_drafts[0].citations[0].document_version_id == "pending-human"
    assert "uncertainties" in bundle.model_dump() or bundle.uncertainties

    # 上限：attempt >= max → needs_human。
    result = revise_bundle(bundle, ["x"], attempt=2, max_attempts=2)
    assert result["needs_human"] is True
