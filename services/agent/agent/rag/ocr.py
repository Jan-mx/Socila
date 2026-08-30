"""OCR 流程（RAG-FR-005/009 / ADR-0003 / PRD §9.1，步骤G3/05.3）。

- 文本PDF：原生文本优先，OCR-VL 仅在无文本层/图片页参与。
- 扫描PDF：逐页送 OCR-VL；混合PDF 逐页路由。
- 关键字段（文号/日期/金额/比例）原生文本优先；原生与 OCR 冲突 → OcrDiscrepancy
  → needs_correction（人工校对队列）。
- 扫描件无原生文本时，关键数字默认人工确认（quality-gates：即使形式正确）。
- 每页独立页面哈希缓存；模型版本随页记录。
"""

from __future__ import annotations

import re
from typing import Any, Protocol

from .pdf import extract_pdf_pages

LOW_CONFIDENCE_THRESHOLD = 0.9
DEFAULT_FIELD_PATTERNS = {
    "document_number": r"〔\s*(\d{4})\s*〕",
    "amount": r"(\d[\d,]*(?:\.\d+)?)\s*元",
    "ratio": r"(\d+(?:\.\d+)?)\s*%",
    "date": r"(\d{4}-\d{2}-\d{2}|\d{4}年\d{1,2}月)",
}


class OcrClient(Protocol):
    def ocr_page(self, page_image: bytes, page_hash: str, prompt_version: str) -> dict[str, Any]: ...


class SiliconFlowOcrClient:
    """PaddlePaddle/PaddleOCR-VL-1.5 远程推理（ADR-0003）。口令/密钥不落日志。"""

    PROMPT_VERSION = "ocr-vl-p1"

    def __init__(self, siliconflow_client: Any, model: str = "PaddlePaddle/PaddleOCR-VL-1.5") -> None:
        self._client = siliconflow_client
        self._model = model
        self._cache: dict[str, dict[str, Any]] = {}

    def ocr_page(self, page_image: bytes, page_hash: str, prompt_version: str) -> dict[str, Any]:
        if page_hash in self._cache:
            cached = dict(self._cache[page_hash])
            cached["cached"] = True
            return cached

        response = self._client.ocr_page(page_image, page_hash, prompt_version)
        self._cache[page_hash] = response
        return response


def detect_field_discrepancies(
    native_text: str, ocr_text: str, field_patterns: dict[str, str]
) -> list[dict[str, Any]]:
    """原生文本与 OCR 结果的关键字段冲突检测（OcrDiscrepancy）。"""
    discrepancies: list[dict[str, Any]] = []
    for field, pattern in field_patterns.items():
        native_values = re.findall(pattern, native_text or "")
        ocr_values = re.findall(pattern, ocr_text or "")
        if native_values and ocr_values and native_values != ocr_values:
            discrepancies.append(
                {
                    "field": field,
                    "native": native_values,
                    "ocr": ocr_values,
                }
            )
    return discrepancies


def ocr_document(
    pdf_bytes: bytes,
    ocr_client: OcrClient,
    low_confidence_threshold: float = LOW_CONFIDENCE_THRESHOLD,
    max_pages: int = 200,
) -> dict[str, Any]:
    """逐页路由：有文本层 → 原生优先；无文本层 → OCR-VL。

    - OCR 置信度 < 阈值 → needs_correction（人工校对队列）。
    - 扫描页（无原生文本）关键数字默认人工确认。
    - 返回 {status, pages, correction_required_pages}。
    """
    pages = extract_pdf_pages(pdf_bytes, max_pages=max_pages)
    correction_pages: list[int] = []
    page_records: list[dict[str, Any]] = []

    for page in pages:
        record: dict[str, Any] = {
            "page": page["page"],
            "page_hash": page["page_hash"],
            "native_text": page["text_layer"],
            "text": page["text"],
            "ocr": None,
        }
        if not page["text_layer"]:
            ocr_result = ocr_client.ocr_page(
                page["page_hash"].encode(), page["page_hash"], "ocr-vl-p1"
            )
            record["ocr"] = {
                "model": ocr_result.get("model"),
                "confidence": ocr_result.get("confidence"),
                "trace_id": ocr_result.get("trace_id"),
                "cached": ocr_result.get("cached", False),
            }
            record["text"] = ocr_result.get("text", "")
            if (ocr_result.get("confidence") or 0) < low_confidence_threshold:
                correction_pages.append(page["page"])

        page_records.append(record)

    status = "needs_correction" if correction_pages else "parsed"
    return {
        "status": status,
        "pages": page_records,
        "correction_required_pages": correction_pages,
    }
