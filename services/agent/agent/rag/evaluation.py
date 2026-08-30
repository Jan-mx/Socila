"""步骤05.10 RAG 评测 harness 与黄金集（quality-gates 门禁）。

黄金集覆盖：养老、失业、医保、有效期、地区覆盖（沪/粤/川）。
指标（RAGAS 口径）：
- Context Precision：排名加权的相关项占比（relevant 在 top1 → 1.0）。
- Context Recall：标注证据被检索覆盖的比例。
- 引用覆盖率：每个返回结果都有可回溯引用。
- 错地区混入率：返回结果中不属于目标地区（或其上级链）的数量。
Faithfulness 需 LLM 评测链路，在阶段06 草案 verify 节点落地。
"""

from __future__ import annotations

from dataclasses import dataclass

from agent.rag.pipeline import RetrievalService


@dataclass
class GoldenCase:
    question: str
    jurisdiction_code: str
    as_of_date: str
    expected_chunk_path_contains: str  # 标注证据所在路径/文本关键词
    expected_jurisdiction: str  # 证据所属地区


GOLDEN_SET: list[GoldenCase] = [
    GoldenCase("失业保险金最长可以领多久", "310000", "2026-01-01", "失业保险", "310000"),
    GoldenCase("养老保险最少要缴多少年", "310000", "2026-01-01", "养老", "310000"),
    GoldenCase("广东最低工资标准是多少", "440000", "2026-01-01", "最低工资", "440000"),
    GoldenCase("四川医保封顶线相关基数", "510000", "2026-01-01", "医保", "510000"),
    GoldenCase("上海的缴费基数上限", "310000", "2026-01-01", "缴费基数", "310000"),
]


def _ragas_context_precision(relevance_by_rank: list[bool]) -> float:
    """RAGAS context_precision：对每个相关位次 k，计算 precision@k，取平均。"""
    relevant_count = sum(1 for r in relevance_by_rank if r)
    if relevant_count == 0:
        return 0.0
    seen_relevant = 0
    total = 0.0
    for k, relevant in enumerate(relevance_by_rank, start=1):
        if relevant:
            seen_relevant += 1
            total += seen_relevant / k
    return total / relevant_count


def evaluate(retrieval: RetrievalService, top_k: int = 5) -> dict[str, float | int | str]:
    precision_sum = 0.0
    recall_hits = 0
    citation_ok = 0
    wrong_jurisdiction = 0

    for case in GOLDEN_SET:
        hits = retrieval.search(
            case.question, case.jurisdiction_code, case.as_of_date, top_k=top_k
        )
        relevance_by_rank: list[bool] = []
        for hit in hits:
            haystack = (hit.citation.get("path") or "") + hit.text
            relevant = case.expected_chunk_path_contains in haystack
            relevance_by_rank.append(relevant)
            if hit.citation.get("documentVersionId"):
                citation_ok += 1 / max(len(hits), 1)
            jurisdiction = hit.citation.get("jurisdictionCode")
            if jurisdiction not in (None, "", case.expected_jurisdiction):
                wrong_jurisdiction += 1
        precision_sum += _ragas_context_precision(relevance_by_rank)
        if any(relevance_by_rank):
            recall_hits += 1

    total = len(GOLDEN_SET)
    return {
        "golden_cases": total,
        "context_precision": round(precision_sum / total, 4),
        "context_recall": round(recall_hits / total, 4),
        "citation_coverage": round(citation_ok / total, 4),
        "wrong_jurisdiction_count": wrong_jurisdiction,
    }
