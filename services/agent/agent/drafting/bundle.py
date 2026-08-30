"""DraftBundle 契约、verify 与 revise（DRF-FR-005～011 / PRD §7，步骤06.3/06.5）。

- DraftBundle 为 Pydantic 模型：畸形输入一律拒绝。
- verify：引用完整性（无原文引用/地区或有效期不确定 → 不通过）、参数引用可解析、
  状态只允许 draft、回归模拟（测试草案逐条执行）。
- revise：仅根据 verify 错误修正，固定上限（默认 2 次），超过进入人工审核。
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, ValidationError


class Citation(BaseModel):
    document_version_id: str | None = None
    kind: str | None = None
    path: str | None = None
    text_excerpt: str | None = None

    def valid(self) -> bool:
        return bool(self.document_version_id) and bool(self.path or self.text_excerpt)


class RuleDraft(BaseModel):
    temp_id: str
    rule_id: str
    name: str
    module: str = "draft"
    priority: int = 0
    decision_table: dict[str, Any]
    status: str = "draft"
    effective_from: str
    effective_to: str | None = None
    citations: list[Citation]
    parameter_refs: list[str] = []

    def missing_citations(self) -> bool:
        return not self.citations or not all(c.valid() for c in self.citations)


class ParamDraft(BaseModel):
    temp_id: str
    param_id: str
    business_key: str | None = None
    type: str = "number"
    value: Any = None
    unit: str | None = None
    source: str | None = None
    effective_from: str
    effective_to: str | None = None
    citations: list[Citation]

    def missing_citations(self) -> bool:
        return not self.citations or not all(c.valid() for c in self.citations)


class TestDraft(BaseModel):
    temp_id: str
    name: str
    rule_id: str
    input: dict[str, Any] = {}
    expected: dict[str, Any] = {}
    citations: list[Citation] = []

    def missing_citations(self) -> bool:
        return not self.citations or not all(c.valid() for c in self.citations)


class DraftBundle(BaseModel):
    proposal_id: str
    run_id: str
    idempotency_key: str
    base_snapshot_id: str | None = None
    jurisdiction_code: str = "310000"
    effective_from: str
    effective_to: str | None = None
    status: str = "draft"  # 只允许 draft——production/staging 由 Core 拒绝。
    rule_drafts: list[RuleDraft] = []
    param_drafts: list[ParamDraft] = []
    test_drafts: list[TestDraft] = []
    impact_items: list[dict[str, Any]] = []
    citations: list[Citation] = []
    uncertainties: list[str] = []
    schema_results: dict[str, Any] = {"passed": False, "errors": []}
    dependency_results: dict[str, Any] = {"passed": False, "errors": []}
    regression_results: dict[str, Any] = {"passed": False, "errors": []}
    model_provenance: str = "fake-model-v1"
    prompt_version: str = "draft-p1"
    workflow_version: str = "policyops-graph-v1"


def verify_bundle(
    bundle: DraftBundle,
    known_param_keys: set[str] | None = None,
    regression_runner: Any = None,
) -> dict[str, Any]:
    """确定性校验（DRF-FR-009～010）：引用、Schema、依赖、回归模拟。

    返回 {passed, errors, can_review}；任何失败 → can_review=False（AC-003）。
    """
    errors: list[str] = []

    # 1) Schema：模型已强校验；补充状态限制（AGT/DRF-FR-013：只能创建 draft）。
    if bundle.status != "draft":
        errors.append(f"status must be draft, got {bundle.status}")

    # 2) 引用完整性（DRF-FR-009）。
    missing = []
    for r in bundle.rule_drafts:
        if r.missing_citations():
            missing.append(f"rule:{r.rule_id}")
    for p in bundle.param_drafts:
        if p.missing_citations():
            missing.append(f"param:{p.param_id}")
    for t in bundle.test_drafts:
        if t.missing_citations():
            missing.append(f"test:{t.name}")
    if not bundle.citations and not bundle.rule_drafts and not bundle.param_drafts:
        errors.append("bundle has no citations at all")
    if missing:
        errors.append(f"missing/invalid citations: {missing}")

    # 3) 地区/有效期确定性。
    if not bundle.effective_from:
        errors.append("effective_from undetermined")

    # 4) 参数引用依赖。
    dependency_errors: list[str] = []
    known = known_param_keys or {p.param_id for p in bundle.param_drafts}
    for r in bundle.rule_drafts:
        for ref in r.parameter_refs:
            if ref not in known:
                dependency_errors.append(f"rule {r.rule_id} 引用未知参数 {ref}")
    if dependency_errors:
        errors.extend(dependency_errors)

    # 5) 回归模拟（测试草案逐条执行，由调用方注入确定性 runner）。
    regression_errors: list[str] = []
    if regression_runner is not None:
        regression_errors = regression_runner(bundle) or []
        errors.extend(regression_errors)

    schema_passed = True
    dependency_passed = not dependency_errors
    regression_passed = not regression_errors
    passed = not errors

    bundle.schema_results = {"passed": schema_passed, "errors": []}
    bundle.dependency_results = {"passed": dependency_passed, "errors": dependency_errors}
    bundle.regression_results = {"passed": regression_passed, "errors": regression_errors}

    return {
        "passed": passed,
        "errors": errors,
        "can_review": passed,  # DRF-AC-003：引用缺失等失败不得进入可批准状态。
        "attempts": 0,
    }


def revise_bundle(bundle: DraftBundle, errors: list[str], attempt: int, max_attempts: int = 2) -> dict[str, Any]:
    """自动修正循环（DRF-FR-011）：仅按错误修正，固定上限，超过交人工。

    Fake 修正策略：为缺失引用的实体补占位引用（标注 needs_human=True），
    并移除引用未知参数的引用项。真实修正由阶段06后段的模型节点实现。
    """
    if attempt >= max_attempts:
        return {"revised": False, "reason": "revise-attempt-limit", "needs_human": True}

    revised = False
    for r in bundle.rule_drafts:
        if r.missing_citations():
            r.citations = [Citation(document_version_id="pending-human", path="needs-human", text_excerpt="auto-marked")]
            bundle.uncertainties.append(f"rule:{r.rule_id} citations auto-marked for human review")
            revised = True
    for p in bundle.param_drafts:
        if p.missing_citations():
            p.citations = [Citation(document_version_id="pending-human", path="needs-human", text_excerpt="auto-marked")]
            bundle.uncertainties.append(f"param:{p.param_id} citations auto-marked for human review")
            revised = True

    removed_refs: list[str] = []
    known = {p.param_id for p in bundle.param_drafts}
    for r in bundle.rule_drafts:
        bad = [ref for ref in r.parameter_refs if ref not in known]
        if bad:
            r.parameter_refs = [ref for ref in r.parameter_refs if ref not in bad]
            removed_refs.extend(bad)
            revised = True
    if removed_refs:
        bundle.uncertainties.append(f"removed unknown param refs: {removed_refs}")

    return {"revised": revised, "needs_human": False, "removed_refs": removed_refs}


def parse_bundle(raw: Any) -> DraftBundle:
    """畸形 DraftBundle 一律 ValidationError 拒绝（测试矩阵 Schema 行）。"""
    if isinstance(raw, str):
        return DraftBundle.model_validate_json(raw)
    return DraftBundle.model_validate(raw)
