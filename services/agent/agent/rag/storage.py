"""对象存储（RAG-FR-003）：MinIO 实现 + 内存实现（单测）。

缺桶生命周期契约（SHV2-FR-023/SHV2-NFR-006）：构造与只读操作零副作用——
不隐式创建bucket；bucket创建只经显式`ensure_bucket()`（授权apply写入段）。
"""

from __future__ import annotations

from typing import Protocol


class ObjectStore(Protocol):
    def put(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> str: ...
    def get(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def bucket_exists(self) -> bool: ...
    def ensure_bucket(self) -> bool: ...


class InMemoryObjectStore:
    def __init__(self, *, with_bucket: bool = True) -> None:
        self._objects: dict[str, bytes] = {}
        self._bucket_exists = with_bucket

    def bucket_exists(self) -> bool:
        return self._bucket_exists

    def ensure_bucket(self) -> bool:
        """显式写入入口：缺失则创建返回True；已存在幂等返回False。"""
        if self._bucket_exists:
            return False
        self._bucket_exists = True
        return True

    def put(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> str:
        if not self._bucket_exists:
            raise RuntimeError("NoSuchBucket: bucket不存在（真实MinIO在缺失bucket上put同样失败；bucket创建属于授权apply的ensure_bucket）")
        self._objects[key] = content
        return key

    def get(self, key: str) -> bytes:
        return self._objects[key]

    def exists(self, key: str) -> bool:
        return key in self._objects


class MinioObjectStore:
    """MinIO对象存储：构造只建立连接信息，不隐式创建bucket。"""

    def __init__(self, endpoint: str, access_key: str, secret_key: str, bucket: str = "policy-originals", secure: bool = False) -> None:
        from minio import Minio

        self._bucket = bucket
        self._client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)

    def bucket_exists(self) -> bool:
        """只读：目标bucket是否存在（零写入副作用）。"""
        return self._client.bucket_exists(self._bucket)

    def ensure_bucket(self) -> bool:
        """显式建桶入口（仅授权apply写入段调用）：已存在返回False；本次创建返回True；
        并发创建竞争失败（BucketAlreadyOwnedByYou/BucketAlreadyExists）按幂等复查处理；
        权限、连接等其他MinIO错误原样抛出，不吞掉。"""
        from minio.error import S3Error

        if self._client.bucket_exists(self._bucket):
            return False
        try:
            self._client.make_bucket(self._bucket)
            return True
        except S3Error as err:
            if err.code in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists") and self._client.bucket_exists(self._bucket):
                return False
            raise

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
