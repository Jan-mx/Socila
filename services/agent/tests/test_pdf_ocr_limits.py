"""G2/G3/G4 失败测试（TDD 先行）：

- G2 文本PDF逐页（PyMuPDF 原生文本 + 页面哈希 + 页数上限）
- G3 OCR-VL 客户端 + 逐页路由 + OcrDiscrepancy→needs_correction + 页面哈希缓存
- G4 资源限制（XLSX 10万行、JSON>5MB 流式、lxml 禁外部实体）
- G1 Worker 统一配置
"""

from __future__ import annotations

import io

import pytest


def _make_text_pdf() -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "沪人社规〔2025〕第 1 号")
    page.insert_text((72, 120), "缴费基数上限 36549 元/月")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_scanned_pdf() -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()  # 无文本层 → 视为扫描页
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_pdf_native_text_pages_and_hashes():
    from agent.rag.pdf import extract_pdf_pages

    raw = _make_text_pdf()
    pages = extract_pdf_pages(raw, max_pages=200)
    assert len(pages) == 1
    assert pages[0]["text_layer"] is True
    assert "2025" in pages[0]["text"]
    assert pages[0]["page_hash"]


def test_pdf_page_limit_rejected():
    from agent.rag.pdf import extract_pdf_pages
    from agent.rag.fetcher import FetchRejected

    with pytest.raises(FetchRejected, match="page-limit"):
        import fitz

        doc = fitz.open()
        for _ in range(3):
            doc.new_page()
        buf = io.BytesIO()
        doc.save(buf)
        extract_pdf_pages(buf.getvalue(), max_pages=2)


class FakeOcrClient:
    """确定性 OCR-VL Fake：返回固定字段；可控制置信度。"""

    def __init__(self, confidence: float = 0.99) -> None:
        self.confidence = confidence
        self.calls: list[str] = []

    def ocr_page(self, page_image: bytes, page_hash: str, prompt_version: str) -> dict:
        self.calls.append(page_hash)
        return {
            "model": "PaddlePaddle/PaddleOCR-VL-1.5",
            "text": "沪人社规〔2025〕第 1 号\n缴费基数上限 36549 元/月",
            "confidence": self.confidence,
            "page_hash": page_hash,
            "prompt_version": prompt_version,
            "trace_id": "trace-ocr-1",
        }


def test_hybrid_pdf_routing_native_text_preferred():
    from agent.rag.ocr import ocr_document
    from agent.rag.pdf import extract_pdf_pages

    raw = _make_text_pdf()
    ocr = FakeOcrClient()
    result = ocr_document(raw, ocr, low_confidence_threshold=0.9)
    # 原生文本层存在 → 不调用 OCR（原生优先，ADR-0006/0003）。
    assert ocr.calls == []
    assert result["pages"][0]["native_text"] is True
    assert result["status"] == "parsed"


def test_scanned_page_routes_to_ocr_and_low_confidence_needs_correction():
    from agent.rag.ocr import ocr_document

    raw = _make_scanned_pdf()
    ocr = FakeOcrClient(confidence=0.55)  # 低于 0.9 阈值 → 需校对
    result = ocr_document(raw, ocr, low_confidence_threshold=0.9)
    assert len(ocr.calls) == 1  # 扫描页逐页送 OCR
    assert result["status"] == "needs_correction"
    assert result["correction_required_pages"] == [1]

    ocr2 = FakeOcrClient(confidence=0.99)
    result2 = ocr_document(raw, ocr2, low_confidence_threshold=0.9)
    assert result2["status"] == "parsed"
    assert result2["pages"][0]["ocr"]["confidence"] == 0.99


def test_native_vs_ocr_field_conflict_creates_discrepancy():
    from agent.rag.ocr import detect_field_discrepancies

    discrepancies = detect_field_discrepancies(
        native_text="文号：沪人社规〔2024〕第 9 号",
        ocr_text="文号：沪人社规〔2025〕第 1 号",
        field_patterns={"document_number": r"〔(\d{4})〕"},
    )
    assert discrepancies, "文号年份冲突应产生 OcrDiscrepancy"


def test_xlsx_row_limit_rejected():
    from openpyxl import Workbook

    from agent.rag.document_tree import parse_xlsx_with_limits

    wb = Workbook(write_only=True)
    ws = wb.create_sheet()
    for i in range(100_002):
        ws.append([i, "x"])
    buf = io.BytesIO()
    wb.save(buf)
    with pytest.raises(Exception, match="row-limit"):
        parse_xlsx_with_limits(buf.getvalue(), max_rows=100_000)


def test_json_over_5mb_streamed():
    from agent.rag.document_tree import parse_json_streamed

    big = b'{"items": [' + b",".join(b'{"id": %d, "note": "n"}' % i for i in range(700_000)) + b"]}"
    assert len(big) > 5 * 1024 * 1024
    result = parse_json_streamed(big)
    assert result.tree.type == "document"


def test_worker_unified_config():
    from agent.worker.celery_app import celery_app

    conf = celery_app.conf
    assert conf.worker_concurrency == 1
    assert conf.worker_prefetch_multiplier == 1
    assert conf.worker_max_tasks_per_child == 20
    assert conf.task_soft_time_limit == 110  # < 120s 硬超时
    assert conf.task_time_limit == 120
    assert "agent.dead" in (conf.task_routes.get("agent.dead.*") or {}).get("queue", "")
