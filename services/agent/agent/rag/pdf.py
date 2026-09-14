"""文本 PDF 逐页处理（RAG-FR-005/008 / ADR-0006，步骤G2）：PyMuPDF 原生文本 + 页面哈希。"""

from __future__ import annotations

import hashlib
from typing import Any

from .fetcher import FetchRejected


def extract_pdf_pages(raw: bytes, max_pages: int = 200) -> list[dict[str, Any]]:
    """逐页提取原生文本与页面哈希；超过页数上限直接拒绝（AC-009）。"""
    import fitz

    doc = fitz.open(stream=raw, filetype="pdf")
    try:
        if doc.page_count > max_pages:
            raise FetchRejected(f"page-limit:{doc.page_count}>{max_pages}")
        pages: list[dict[str, Any]] = []
        for index, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            pixmap = page.get_pixmap(dpi=72)
            page_hash = hashlib.sha256(pixmap.tobytes("png")).hexdigest()[:32]
            pages.append(
                {
                    "page": index,
                    "text_layer": bool(text),
                    "text": text,
                    "page_hash": page_hash,
                }
            )
        return pages
    finally:
        doc.close()
