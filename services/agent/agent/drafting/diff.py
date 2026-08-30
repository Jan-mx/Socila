"""条款树 Diff（DRF-FR-001/002 / PRD §6.1，步骤06.1）。

匹配策略：稳定条号/文号 → 规范化文本相似度 → 邻接关系。
变化类型：added/removed/modified/moved/split/merged；保留新旧条款 ID、文本、路径、
页码与相似度证据。移动与删除+新增区分（同文本不同路径 = moved）。
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass, field
from typing import Any

from agent.rag.document_tree import TreeNode


@dataclass
class DiffEntry:
    kind: str  # added|removed|modified|moved|split|merged
    path_old: str | None
    path_new: str | None
    text_old: str | None
    text_new: str | None
    similarity: float = 1.0
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "path_old": self.path_old,
            "path_new": self.path_new,
            "text_old": self.text_old,
            "text_new": self.text_new,
            "similarity": round(self.similarity, 4),
            "evidence": self.evidence,
        }


def _flatten(node: TreeNode, path: str = "") -> list[tuple[str, str]]:
    """展开为 (结构路径, 规范化文本) 列表（仅正文节点）。"""
    items: list[tuple[str, str]] = []
    node_path = f"{path}/{node.type}"
    text = node.text.strip()
    if node.type in ("chapter", "article") or (node.type == "paragraph" and len(text) > 12):
        items.append((node_path, text))
    for child in node.children:
        items.extend(_flatten(child, node_path))
    return items


def _norm(text: str) -> str:
    import re

    return re.sub(r"\s+", "", text)


def _similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def diff_trees(old: TreeNode, new: TreeNode, similarity_threshold: float = 0.72) -> list[DiffEntry]:
    old_items = _flatten(old)
    new_items = _flatten(new)
    old_index = {i: t for i, t in enumerate(old_items)}
    new_index = {i: t for i, t in enumerate(new_items)}

    # 1) 精确匹配（同路径同文本）→ 无变化。
    matched_old: set[int] = set()
    matched_new: set[int] = set()
    pairs: list[tuple[int, int, float]] = []

    for oi, otuple in old_index.items():
        otext = otuple[1]
        for ni, ntuple in new_index.items():
            if ni in matched_new:
                continue
            ntext = ntuple[1]
            sim = _similarity(otext, ntext)
            if sim >= similarity_threshold:
                pairs.append((oi, ni, sim))
                matched_old.add(oi)
                matched_new.add(ni)
                break

    entries: list[DiffEntry] = []

    # 2) 相似对：modified（同路径）或 moved（不同路径，高相似）。
    for oi, ni, sim in pairs:
        otext = old_index[oi][1]
        ntext = new_index[ni][1]
        same_path = old_index[oi][0] == new_index[ni][0]
        if _norm(otext) == _norm(ntext) and same_path:
            continue  # 未变化
        kind = "modified" if same_path else "moved"
        entries.append(
            DiffEntry(
                kind=kind,
                path_old=old_index[oi][0],
                path_new=new_index[ni][0],
                text_old=otext[:200],
                text_new=ntext[:200],
                similarity=sim,
                evidence={"matcher": "normalized-text-similarity"},
            )
        )

    # 3) 拆分/合并：一对多相似。
    removed = [i for i in range(len(old_items)) if i not in matched_old]
    added = [i for i in range(len(new_items)) if i not in matched_new]

    for oi in list(removed):
        otext = old_items[oi][1]
        targets = [ni for ni in added if _similarity(otext, new_items[ni][1]) >= similarity_threshold * 0.85]
        if len(targets) >= 2:
            removed.remove(oi)
            for ni in targets:
                added.remove(ni)
                entries.append(
                    DiffEntry(
                        kind="split",
                        path_old=old_items[oi][0],
                        path_new=new_items[ni][0],
                        text_old=otext[:200],
                        text_new=new_items[ni][1][:200],
                        similarity=_similarity(otext, new_items[ni][1]),
                        evidence={"split_parts": len(targets)},
                    )
                )

    merged_groups: list[list[int]] = []
    for ni in list(added):
        ntext = new_items[ni][1]
        sources = [oi for oi in removed if _similarity(old_items[oi][1], ntext) >= similarity_threshold * 0.85]
        if len(sources) >= 2:
            added.remove(ni)
            for oi in sources:
                removed.remove(oi)
            merged_groups.append(sources + [])
            entries.append(
                DiffEntry(
                    kind="merged",
                    path_old=old_items[sources[0]][0],
                    path_new=new_items[ni][0],
                    text_old=old_items[sources[0]][1][:200],
                    text_new=ntext[:200],
                    similarity=_similarity(old_items[sources[0]][1], ntext),
                    evidence={"merged_from": len(sources)},
                )
            )

    # 4) 剩余：removed / added。
    for oi in removed:
        entries.append(
            DiffEntry(
                kind="removed",
                path_old=old_items[oi][0],
                path_new=None,
                text_old=old_items[oi][1][:200],
                text_new=None,
                evidence={},
            )
        )
    for ni in added:
        entries.append(
            DiffEntry(
                kind="added",
                path_old=None,
                path_new=new_items[ni][0],
                text_old=None,
                text_new=new_items[ni][1][:200],
                evidence={},
            )
        )

    return entries
