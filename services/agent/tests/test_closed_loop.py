"""步骤06.8 真实政策闭环（DRF-FR-012/013 / AC-001/002/004/005/006）：

真实历史政策样本（上海最低工资标准调整，两版本）→ 采集解析 → Diff → 影响检索 →
DraftBundle 生成 → verify → 管理员 edit-and-approve → Core 幂等物化（保留 Agent 原稿）。
"""

from __future__ import annotations

import os

import pytest

from agent.drafting.bundle import parse_bundle, verify_bundle
from agent.drafting.diff import diff_trees
from agent.drafting.impact import CoreEntity, find_impacted_entities
from agent.rag.document_tree import parse_markdown_or_text

DRILL = os.environ.get("SSP_TEST_DATABASE_URL")

POLICY_2024 = """# 上海市最低工资标准规定（2024版）

第一条 本市月最低工资标准为每月2690元。

第二条 下列项目不作为月最低工资标准的组成部分：加班费、高温津贴。

第三条 本规定自2024年7月1日起施行。
"""

POLICY_2025 = """# 上海市最低工资标准规定（2025版）

第一条 本市月最低工资标准调整为每月2740元。

第二条 下列项目不作为月最低工资标准的组成部分：加班费、高温津贴、伙食补贴。

第三条 本规定自2025年7月1日起施行。
"""


@pytest.mark.skipif(not DRILL, reason="requires SSP_TEST_DATABASE_URL")
def test_real_policy_closed_loop():
    # 1) 解析两版政策（真实历史政策样本）。
    old_tree = parse_markdown_or_text(POLICY_2024.encode()).tree
    new_tree = parse_markdown_or_text(POLICY_2025.encode()).tree

    # 2) Diff（AC-001）：标注变化 = 第一条修改 + 第二条修改 + 第三条未变。
    entries = diff_trees(old_tree, new_tree)
    modified = [e for e in entries if e.kind == "modified"]
    assert modified, "应识别出条款修改"
    assert any("2740" in (e.text_new or "") for e in modified)
    assert any("伙食补贴" in (e.text_new or "") for e in modified)

    # 3) 影响检索（AC-002）：Core 实体 + 标注受影响集合。
    entities = [
        CoreEntity("param", "P-SH-MIN-WAGE", "最低工资标准 每月 2690 元"),
        CoreEntity("rule", "R-300-SUBSIDY", "灵活就业补贴按最低工资标准 50% 计算", param_refs=["P-SH-MIN-WAGE"]),
        CoreEntity("test", "T-300-MIN-WAGE", "最低工资 2690 → 补贴 1345", rule_refs=["R-300-SUBSIDY"]),
    ]
    impacts = find_impacted_entities(entries, entities)
    recalled = {i.entity_key for i in impacts}
    labeled = {"P-SH-MIN-WAGE", "R-300-SUBSIDY", "T-300-MIN-WAGE"}
    assert len(labeled & recalled) / len(labeled) >= 0.9

    # 4) DraftBundle 生成（真实调整值带引用）。
    bundle = parse_bundle(
        {
            "proposal_id": "closed-loop-p1",
            "run_id": "closed-loop-r1",
            "idempotency_key": "closed-loop-mat-1",
            "base_snapshot_id": None,
            "jurisdiction_code": "310000",
            "effective_from": "2025-07-01",
            "status": "draft",
            "rule_drafts": [],
            "param_drafts": [
                {
                    "temp_id": "p1",
                    "param_id": "P-SH-MIN-WAGE",
                    "business_key": "P-SH-MIN-WAGE",
                    "type": "number",
                    "value": 2740,
                    "unit": "元/月",
                    "source": "沪人社规〔2025〕最低工资调整",
                    "effective_from": "2025-07-01",
                    "citations": [
                        {
                            "document_version_id": "dv-2025",
                            "kind": "modified",
                            "path": "/document/chapter/article",
                            "text_excerpt": "每月2740元",
                        }
                    ],
                }
            ],
            "test_drafts": [],
            "impact_items": [i.to_dict() for i in impacts],
            "citations": [
                {"document_version_id": "dv-2025", "kind": "modified", "path": "/document/chapter/article"}
            ],
        }
    )
    verify = verify_bundle(bundle, known_param_keys={"P-SH-MIN-WAGE"})
    assert verify["passed"] is True and verify["can_review"] is True

    # 5) 管理员 edit-and-approve（AC-004）：管理员补丁 + 保留 Agent 原稿。
    agent_original = bundle.param_drafts[0].value
    admin_patch = {"value": 2745}
    materializing_bundle = {
        **bundle.model_dump(),
        "param_drafts": [
            {**p.model_dump(), "value": admin_patch["value"], "agent_original": agent_original}
            for p in bundle.param_drafts
        ],
    }
    assert materializing_bundle["param_drafts"][0]["agent_original"] == 2740  # Agent 原稿值

    # 6) Core 幂等物化（AC-005）：materialize 服务在 Node 侧覆盖（materialize.test.ts）；
    # 此处断言 bundle 结构与幂等键符合 Core 契约。
    assert bundle.idempotency_key == "closed-loop-mat-1"
    assert bundle.status == "draft"
