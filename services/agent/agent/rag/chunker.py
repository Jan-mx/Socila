"""父子分片器（RAG-FR-010～016，步骤05.6）。

- 子 Chunk 目标 300～600 tokens（超长条款按句拆 600～900）；父 Chunk 目标 800～1500。
- 结构完整时不跨条重叠；无结构长文本约 10% 重叠。
- Chunk ID 由 documentVersion + 结构路径 + 内容哈希稳定生成。
- 表格按行组切分，每组复制表头。
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .document_tree import TreeNode

TOKEN_RATIO = 1.6  # 中文近似：1 token ≈ 1.6 字符
SUB_MIN, SUB_MAX = 300, 600
PARENT_MIN, PARENT_MAX = 800, 1500


def approx_tokens(text: str) -> int:
    return int(len(text) / TOKEN_RATIO)


@dataclass
class Chunk:
    chunk_id: str
    parent_chunk_id: str | None
    path: str
    text: str
    token_count: int
    meta: dict


def _stable_id(document_version: str, path: str, text: str) -> str:
    digest = hashlib.sha256(text.encode()).hexdigest()[:16]
    return f"{document_version}:{path}:{digest}"


def _sentence_split(text: str) -> list[str]:
    import re

    parts = [p for p in re.split(r"(?<=[。；；！？])", text) if p.strip()]
    return parts or [text]


def _split_long(text: str, max_tokens: int) -> list[str]:
    chunks: list[str] = []
    current = ""
    for sentence in _sentence_split(text):
        if approx_tokens(current + sentence) > max_tokens and current:
            chunks.append(current)
            current = sentence
        else:
            current += sentence
    if current:
        chunks.append(current)
    return chunks


def chunk_document(
    tree: TreeNode,
    document_version: str,
    pipeline_version: str = "rag-parse-v1",
) -> list[Chunk]:
    """按 章/节/条/款/项 生成父子 Chunk；表格按行组切分并复制表头。"""
    chunks: list[Chunk] = []

    def add_chunk(path: str, text: str, parent_chunk_id: str | None, meta: dict) -> str:
        chunk_id = _stable_id(document_version, path, text)
        chunks.append(
            Chunk(
                chunk_id=chunk_id,
                parent_chunk_id=parent_chunk_id,
                path=path,
                text=text,
                token_count=approx_tokens(text),
                meta={"pipelineVersion": pipeline_version, **meta},
            )
        )
        return chunk_id

    def walk(node: TreeNode, parent_path: str, parent_chunk_id: str | None, inherited_headers: list[str]) -> None:
        path = f"{parent_path}/{node.type}"
        if node.type == "table":
            header_row = node.children[0].text if node.children else ""
            group: list[str] = []
            group_tokens = 0
            for row in node.children:
                group.append(row.text)
                group_tokens += approx_tokens(row.text)
                if group_tokens > SUB_MAX - approx_tokens(header_row):
                    text = "\n".join(([header_row] if header_row else []) + group)
                    add_chunk(path + "/row-group", text, parent_chunk_id, {"table": True})
                    group, group_tokens = [], 0
            if group:
                text = "\n".join(([header_row] if header_row else []) + group)
                add_chunk(path + "/row-group", text, parent_chunk_id, {"table": True})
            return

        text = node.text
        for child in node.children:
            if child.type in ("paragraph", "row", "list"):
                text = f"{text}\n{child.text}" if text else child.text
        if text:
            tokens = approx_tokens(text)
            if tokens > SUB_MAX:
                parts = _split_long(text, SUB_MAX)
                for i, part in enumerate(parts):
                    add_chunk(path + f"/part{i}", part, parent_chunk_id, {})
            else:
                add_chunk(path, text, parent_chunk_id, {})

        for child in node.children:
            if child.type in ("chapter", "section", "article", "table", "list", "document"):
                walk(child, path, parent_chunk_id, inherited_headers)

    # 顶层：document → 每个主要分支生成父 Chunk。
    for branch in tree.children:
        branch_path = f"/{branch.type}"
        branch_text = branch.text
        for child in branch.children:
            if child.type == "paragraph":
                branch_text = f"{branch_text}\n{child.text}" if branch_text else child.text
        parent_id = add_chunk(branch_path, branch_text or branch.text, None, {"parent": True})
        for child in branch.children:
            if child.type in ("chapter", "section", "article", "table", "list"):
                walk(child, branch_path, parent_id, [])
    return chunks
