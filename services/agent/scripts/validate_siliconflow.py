"""05.7 SiliconFlow 真实验证（只输出允许字段：状态/模型/维度/用量/排序/trace）。

用法：SILICONFLOW_API_KEY=... uv run python scripts/validate_siliconflow.py
绝不打印 API Key、Authorization、完整向量或图片 Base64。
"""

from __future__ import annotations

import io
import json
import sys

sys.path.insert(0, ".")

from agent.rag.siliconflow import SiliconFlowClient  # noqa: E402


def render_public_sample_png() -> bytes:
    """公开测试句子渲染为图片（非用户数据）。"""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "沪人社规〔2025〕第 1 号")
    page.insert_text((72, 120), "缴费基数上限 36549 元/月")
    page.insert_text((72, 168), "自 2025-07-01 起施行，比例 16%")
    return page.get_pixmap(dpi=150).tobytes("png")


def main() -> None:
    report: dict[str, object] = {"verifications": []}

    client = SiliconFlowClient()

    # 1) GET /models
    try:
        models = client.list_models()
        visible = {
            "bge-m3": any("bge-m3" in m for m in models),
            "reranker": any("bge-reranker-v2-m3" in m for m in models),
            "ocr-vl-1.5": any("PaddleOCR-VL-1.5" in m for m in models),
        }
        report["verifications"].append(
            {"endpoint": "GET /models", "status": 200, "model_count": len(models), "visible": visible}
        )
    except Exception as err:  # noqa: BLE001
        report["verifications"].append({"endpoint": "GET /models", "status": getattr(err, "status_code", "error"), "error": str(err)[:120]})

    # 2) POST /embeddings
    try:
        emb = client.embed(["上海市最低工资标准为每月2690元。", "失业保险金领取期限最长不超过24个月。"])
        report["verifications"].append(
            {
                "endpoint": "POST /embeddings",
                "status": 200,
                "model": emb["model"],
                "dimensions": emb["dimensions"],
                "vector_count": emb["vector_count"],
                "usage": emb["usage"],
                "indexVersion": emb["indexVersion"],
            }
        )
    except Exception as err:  # noqa: BLE001
        report["verifications"].append({"endpoint": "POST /embeddings", "status": getattr(err, "status_code", "error"), "error": str(err)[:120]})

    # 3) POST /rerank
    try:
        results = client.rerank(
            "失业保险金领取期限",
            ["失业保险金最长领取24个月。", "养老保险需累计缴费满15年。", "医保个人账户按月划入。"],
            top_n=3,
        )
        report["verifications"].append(
            {
                "endpoint": "POST /rerank",
                "status": 200,
                "model": client.rerank_model,
                "ranking": [(r["index"], round(r["relevance_score"], 4)) for r in results],
            }
        )
    except Exception as err:  # noqa: BLE001
        report["verifications"].append({"endpoint": "POST /rerank", "status": getattr(err, "status_code", "error"), "error": str(err)[:120]})

    # 4) PaddleOCR-VL-1.5 真实推理（公开测试句子图片）
    try:
        from agent.rag.ocr import SiliconFlowOcrClient

        image = render_public_sample_png()
        ocr = SiliconFlowOcrClient(client)
        result = ocr.ocr_page(image, "sample-page-hash", ocr.PROMPT_VERSION)
        text = result.get("text", "")
        key_fields = {
            "document_number_year": "2025" in text,
            "amount_36549": "36549" in text,
            "date_2025_07_01": ("2025-07-01" in text or "2025年7月" in text),
            "ratio_16": "16%" in text or "16" in text,
        }
        report["verifications"].append(
            {
                "endpoint": "POST /chat/completions (OCR-VL-1.5)",
                "status": 200,
                "model": result.get("model"),
                "confidence": result.get("confidence"),
                "trace_id": result.get("trace_id"),
                "key_fields": key_fields,
                "text_length": len(text),
            }
        )
    except Exception as err:  # noqa: BLE001
        report["verifications"].append({"endpoint": "POST /chat/completions (OCR-VL-1.5)", "status": getattr(err, "status_code", "error"), "error": str(err)[:160]})

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
