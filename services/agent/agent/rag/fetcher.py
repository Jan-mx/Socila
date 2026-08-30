"""来源注册与安全抓取（RAG-FR-001～003 / PRD §6，步骤05.1）。

安全规则：
- 仅允许 sources/official-source-registry.md 白名单域名；
- 重定向后的域名必须仍在白名单；
- DNS 解析到内网/环回/链路本地地址一律拒绝（SSRF）；
- 限制响应时间、内容大小与重定向次数；
- 保存原始字节的对象键、SHA-256 哈希与响应头摘要。
"""

from __future__ import annotations

import hashlib
import ipaddress
import socket
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

MAX_REDIRECTS = 3
DEFAULT_TIMEOUT_SECONDS = 20.0

PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


class FetchRejected(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def domain_of(url: str) -> str:
    return urlparse(url).hostname or ""


def load_whitelist(registry_md: str) -> set[str]:
    """从 official-source-registry.md 提取白名单域名（`- **domain.cn**` 行内标记）。"""
    domains: set[str] = set()
    for line in registry_md.splitlines():
        token = line.strip()
        if token.startswith("- "):
            token = token[2:].strip()
        if token.startswith("**") and token.endswith("**") and "." in token:
            domains.add(token.strip("*").lower())
    return domains


def assert_url_allowed(url: str, whitelist: set[str]) -> None:
    scheme = urlparse(url).scheme
    if scheme not in ("http", "https"):
        raise FetchRejected(f"scheme-not-allowed:{scheme}")
    host = domain_of(url)
    if not host:
        raise FetchRejected("empty-host")
    if host not in whitelist and not any(host.endswith("." + d) for d in whitelist):
        raise FetchRejected(f"domain-not-in-whitelist:{host}")


def assert_host_public(hostname: str) -> None:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise FetchRejected(f"dns-resolution-failed:{hostname}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if any(ip in net for net in PRIVATE_NETS):
            raise FetchRejected(f"private-address:{ip}")


@dataclass
class FetchResult:
    url: str
    final_url: str
    status: int
    content: bytes
    content_hash: str
    mime: str
    response_headers: dict[str, str] = field(default_factory=dict)
    redirects: int = 0


def fetch(url: str, whitelist: set[str], max_bytes: int, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> FetchResult:
    """安全抓取：白名单校验（含重定向链）、DNS 内网拒绝、大小/时间限制。"""
    assert_url_allowed(url, whitelist)
    assert_host_public(domain_of(url))

    redirects = 0
    current = url
    with httpx.Client(follow_redirects=False, timeout=timeout) as client:
        while True:
            assert_url_allowed(current, whitelist)
            with client.stream("GET", current) as resp:
                if resp.status_code in (301, 302, 303, 307, 308):
                    redirects += 1
                    if redirects > MAX_REDIRECTS:
                        raise FetchRejected("too-many-redirects")
                    current = str(resp.headers.get("location", ""))
                    assert_url_allowed(current, whitelist)
                    assert_host_public(domain_of(current))
                    continue
                resp.raise_for_status()
                content = b""
                for chunk in resp.iter_bytes():
                    content += chunk
                    if len(content) > max_bytes:
                        raise FetchRejected("payload-too-large")
                return FetchResult(
                    url=url,
                    final_url=str(resp.url),
                    status=resp.status_code,
                    content=content,
                    content_hash=hashlib.sha256(content).hexdigest(),
                    mime=resp.headers.get("content-type", "application/octet-stream"),
                    response_headers={
                        k: v for k, v in resp.headers.items()
                        if k.lower() in ("content-type", "content-length", "last-modified", "etag")
                    },
                    redirects=redirects,
                )
