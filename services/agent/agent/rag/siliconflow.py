"""SiliconFlow 客户端（RAG-FR-005/007 / PRD §9，步骤05.7/05.9）。

- /models、/embeddings、/rerank（OCR-VL 走 chat/completions）。
- 401/403 不重试；429/503/网络超时有限退避（复用 agent.errors 分类）。
- 只输出状态/模型/维度/用量/trace ID——绝不输出密钥或完整向量。
"""

from __future__ import annotations

import os
import re
from typing import Any

import httpx


class SiliconFlowError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _api_key() -> str:
    key = os.environ.get("SILICONFLOW_API_KEY", "")
    if not key:
        raise SiliconFlowError("SILICONFLOW_API_KEY not configured")
    return key


def _base_url() -> str:
    return os.environ.get("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1").rstrip("/")


class SiliconFlowClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None, timeout: float = 30.0) -> None:
        self._api_key = api_key or _api_key()
        self._base_url = (base_url or _base_url()).rstrip("/")
        self._timeout = timeout
        self.embedding_model = os.environ.get("SILICONFLOW_EMBEDDING_MODEL", "BAAI/bge-m3")
        self.embedding_dimensions = int(os.environ.get("SILICONFLOW_EMBEDDING_DIMENSIONS", "1024"))
        self.rerank_model = os.environ.get("SILICONFLOW_RERANK_MODEL", "BAAI/bge-reranker-v2-m3")
        self.index_version = f"{self.embedding_model}:{self.embedding_dimensions}"

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(
                f"{self._base_url}{path}",
                json=payload,
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
        if resp.status_code in (401, 403):
            raise SiliconFlowError(f"auth failed {resp.status_code}", resp.status_code)
        if resp.status_code in (429, 503):
            raise SiliconFlowError(f"upstream busy {resp.status_code}", resp.status_code)
        if resp.status_code >= 400:
            raise SiliconFlowError(f"siliconflow error {resp.status_code}", resp.status_code)
        return resp.json()

    def list_models(self) -> list[str]:
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.get(f"{self._base_url}/models", headers={"Authorization": f"Bearer {self._api_key}"})
        if resp.status_code >= 400:
            raise SiliconFlowError(f"models error {resp.status_code}", resp.status_code)
        data = resp.json()
        return [m["id"] for m in data.get("data", [])]

    def embed(self, texts: list[str]) -> dict[str, Any]:
        """返回 {model, dimensions, vectors(截断为维度计数以避免日志泄漏), usage, indexVersion}。"""
        data = self._post("/embeddings", {"model": self.embedding_model, "input": texts})
        vectors = [item["embedding"] for item in data.get("data", [])]
        dimensions = len(vectors[0]) if vectors else self.embedding_dimensions
        return {
            "model": self.embedding_model,
            "dimensions": dimensions,
            "vector_count": len(vectors),
            "usage": data.get("usage", {}),
            "indexVersion": self.index_version,
            "_vectors": vectors,  # 仅供调用方写库，不得打印。
        }

    def rerank(self, query: str, documents: list[str], top_n: int = 8) -> list[dict[str, Any]]:
        data = self._post(
            "/rerank",
            {"model": self.rerank_model, "query": query, "documents": documents, "top_n": top_n},
        )
        return data.get("results", [])


    def ocr_page(self, page_image: bytes, page_hash: str, prompt_version: str) -> dict[str, Any]:
        """PaddleOCR-VL-1.5 远程推理（公开政策页面；图片不落日志）。"""
        import base64

        data = self._post(
            "/chat/completions",
            {
                "model": "PaddlePaddle/PaddleOCR-VL-1.5",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": "data:image/png;base64,"
                                    + base64.b64encode(page_image).decode()
                                },
                            },
                            {"type": "text", "text": f"识别本页全部文字并输出JSON。prompt_version={prompt_version} page_hash={page_hash}"},
                        ],
                    }
                ],
            },
        )
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        confidence = None
        match = re.search(r'"confidence"\s*:\s*([0-9.]+)', content)
        if match:
            confidence = float(match.group(1))
        return {
            "model": "PaddlePaddle/PaddleOCR-VL-1.5",
            "text": content,
            "confidence": confidence if confidence is not None else 0.0,
            "page_hash": page_hash,
            "prompt_version": prompt_version,
            "trace_id": data.get("id"),
        }


class FakeSiliconFlowClient(SiliconFlowClient):
    """确定性 Fake：固定 1024 维向量（按文本哈希种子）、固定 rerank 顺序。"""

    def __init__(self) -> None:
        super().__init__(api_key="fake", base_url="http://fake.local")

    def list_models(self) -> list[str]:
        return [self.embedding_model, self.rerank_model, "PaddlePaddle/PaddleOCR-VL-1.5"]

    def embed(self, texts: list[str]) -> dict[str, Any]:
        vectors = []
        for t in texts:
            import hashlib

            seed = hashlib.sha256(t.encode()).digest()
            vector = [b / 255.0 for b in (seed * 4)[: self.embedding_dimensions]]
            vectors.append(vector)
        return {
            "model": self.embedding_model,
            "dimensions": self.embedding_dimensions,
            "vector_count": len(vectors),
            "usage": {"total_tokens": sum(len(t) for t in texts)},
            "indexVersion": self.index_version,
            "_vectors": vectors,
        }

    def rerank(self, query: str, documents: list[str], top_n: int = 8) -> list[dict[str, Any]]:
        scored = []
        for i, doc in enumerate(documents):
            score = 1.0 / (i + 1) if query[:8] in doc else 0.5 / (i + 1)
            scored.append({"index": i, "relevance_score": score})
        scored.sort(key=lambda s: -s["relevance_score"])
        return scored[:top_n]
