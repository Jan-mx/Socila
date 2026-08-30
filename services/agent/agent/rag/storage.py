"""对象存储（RAG-FR-003）：MinIO 实现 + 内存实现（单测）。"""

from __future__ import annotations

from typing import Protocol


class ObjectStore(Protocol):
    def put(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> str: ...
    def get(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...


class InMemoryObjectStore:
    def __init__(self) -> None:
        self._objects: dict[str, bytes] = {}

    def put(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        self._objects[key] = content
        return key

    def get(self, key: str) -> bytes:
        return self._objects[key]

    def exists(self, key: str) -> bool:
        return key in self._objects


class MinioObjectStore:
    def __init__(self, endpoint: str, access_key: str, secret_key: str, bucket: str = "policy-originals", secure: bool = False) -> None:
        from minio import Minio

        self._bucket = bucket
        self._client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
        if not self._client.bucket_exists(bucket):
            self._client.make_bucket(bucket)

    def put(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        import io

        self._client.put_object(
            self._bucket, key, io.BytesIO(content), length=len(content), content_type=content_type
        )
        return key

    def get(self, key: str) -> bytes:
        resp = self._client.get_object(self._bucket, key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()

    def exists(self, key: str) -> bool:
        from minio.error import S3Error

        try:
            self._client.stat_object(self._bucket, key)
            return True
        except S3Error:
            return False


def object_store_from_env() -> ObjectStore:
    import os

    if os.environ.get("AGENT_MINIO_ENDPOINT"):
        return MinioObjectStore(
            os.environ["AGENT_MINIO_ENDPOINT"],
            os.environ.get("AGENT_MINIO_ACCESS_KEY", "minioadmin"),
            os.environ.get("AGENT_MINIO_SECRET_KEY", "minioadmin"),
            os.environ.get("AGENT_MINIO_BUCKET", "policy-originals"),
            os.environ.get("AGENT_MINIO_SECURE", "0") == "1",
        )
    return InMemoryObjectStore()
