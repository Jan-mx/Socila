"""DocumentTree 模型与格式适配器（RAG-FR-004～007，步骤05.2/05.4）。

- 统一映射到 DocumentTree（节点含类型、文本、页码、子节点、表格）。
- 适配器：HTML(httpx+lxml)、DOCX(python-docx)、XLSX(openpyxl 只读)、JSON、Markdown/TXT（行式）。
- 解析器版本随 DocumentVersion 记录（pipelineVersion）。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class TreeNode:
    type: str  # document|chapter|section|article|paragraph|list|table|row
    text: str = ""
    page: int | None = None
    children: list[TreeNode] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "text": self.text,
            "page": self.page,
            "meta": self.meta,
            "children": [c.to_dict() for c in self.children],
        }


@dataclass
class ParseResult:
    tree: TreeNode
    pipeline_version: str
    warnings: list[str] = field(default_factory=list)


PIPELINE_VERSION = "rag-parse-v1"


def parse_markdown_or_text(raw: bytes) -> ParseResult:
    text = raw.decode("utf-8", errors="replace")
    root = TreeNode(type="document")
    current_chapter: TreeNode | None = None
    current_article: TreeNode | None = None
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("# "):
            current_chapter = TreeNode(type="chapter", text=stripped[2:])
            root.children.append(current_chapter)
            current_article = None
        elif stripped.startswith("第") and ("条" in stripped[:8] or "章" in stripped[:8]):
            current_article = TreeNode(type="article", text=stripped)
            (current_chapter or root).children.append(current_article)
        else:
            node = TreeNode(type="paragraph", text=stripped)
            (current_article or current_chapter or root).children.append(node)
    return ParseResult(tree=root, pipeline_version=PIPELINE_VERSION)


def parse_json(raw: bytes) -> ParseResult:
    data = json.loads(raw.decode("utf-8", errors="replace"))
    root = TreeNode(type="document")

    def walk(obj: Any, parent: TreeNode) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                node = TreeNode(type="paragraph", text=f"{k}: ")
                if isinstance(v, (dict, list)):
                    parent.children.append(node)
                    walk(v, node)
                else:
                    node.text = f"{k}: {v}"
                    parent.children.append(node)
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, (dict, list)):
                    walk(item, parent)
                else:
                    parent.children.append(TreeNode(type="paragraph", text=str(item)))

    walk(data, root)
    return ParseResult(tree=root, pipeline_version=PIPELINE_VERSION)


def parse_html(raw: bytes) -> ParseResult:
    """HTML→DocumentTree：全块级元素提取（h1-h6/p/li/tr/dd/dt/blockquote/pre）。

    真实政府页面的正文通常位于嵌套div内的p/table中（不与标题同级），因此不能只取
    标题兄弟节点；跳过script/style与嵌套重复块，保留文档顺序；lxml中注释/PI节点的
    .tag是cython工厂函数而非字符串，需类型过滤。"""
    from lxml import html as lxml_html

    doc = lxml_html.fromstring(raw.decode("utf-8", errors="replace"))
    for noise in doc.xpath("//script|//style|//noscript|//template|//head"):
        parent = noise.getparent()
        if parent is not None:
            parent.remove(noise)
    block_xpath = "//h1|//h2|//h3|//h4|//h5|//h6|//p|//li|//tr|//dd|//dt|//blockquote|//pre"
    selected: list[Any] = []
    selected_set: set[int] = set()
    for el in doc.xpath(block_xpath):
        ancestor = el.getparent()
        duplicated = False
        while ancestor is not None:
            if id(ancestor) in selected_set:
                duplicated = True
                break
            ancestor = ancestor.getparent()
        if not duplicated:
            selected.append(el)
            selected_set.add(id(el))
    root = TreeNode(type="document")
    current_chapter: TreeNode | None = None
    for el in selected:
        tag = el.tag.lower() if isinstance(el.tag, str) else ""
        if tag == "tr":
            cells = [" ".join(c.text_content().split()) for c in el.xpath("./td|./th")]
            text = " | ".join(c for c in cells if c) or " ".join(el.text_content().split())
        else:
            text = " ".join(el.text_content().split())
        if not text:
            continue
        if tag in ("h1", "h2", "h3"):
            current_chapter = TreeNode(type="chapter", text=text)
            root.children.append(current_chapter)
        elif tag in ("h4", "h5", "h6"):
            node = TreeNode(type="section", text=text)
            (current_chapter or root).children.append(node)
        else:
            node = TreeNode(type="paragraph", text=text)
            (current_chapter or root).children.append(node)
    if not root.children:
        text = " ".join(doc.text_content().split())
        root.children.append(TreeNode(type="paragraph", text=text))
    return ParseResult(tree=root, pipeline_version=PIPELINE_VERSION)


def parse_docx(raw: bytes) -> ParseResult:
    import io

    from docx import Document

    document = Document(io.BytesIO(raw))
    root = TreeNode(type="document")
    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = para.style
        if style is not None and style.name.lower().startswith("heading"):
            root.children.append(TreeNode(type="chapter", text=text))
        else:
            root.children.append(TreeNode(type="paragraph", text=text))
    for table in document.tables:
        tnode = TreeNode(type="table")
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            tnode.children.append(TreeNode(type="row", text=" | ".join(cells)))
        root.children.append(tnode)
    return ParseResult(tree=root, pipeline_version=PIPELINE_VERSION)


def parse_xlsx(raw: bytes) -> ParseResult:
    import io

    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    root = TreeNode(type="document")
    for sheet in workbook.worksheets:
        sheet_node = TreeNode(type="chapter", text=sheet.title)
        for row in sheet.iter_rows(values_only=True):
            cells = ["" if v is None else str(v) for v in row]
            if any(cells):
                sheet_node.children.append(TreeNode(type="row", text=" | ".join(cells)))
        root.children.append(sheet_node)
    return ParseResult(tree=root, pipeline_version=PIPELINE_VERSION)


def parse_by_mime(mime: str, filename: str, raw: bytes) -> ParseResult:
    """按 MIME/扩展名路由（RAG-FR-001）。不支持/超限由调用方拒绝。"""
    lower = filename.lower()
    if "pdf" in mime or lower.endswith(".pdf"):
        raise NotImplementedError("pdf routed to 05.3 OCR pipeline")
    if "wordprocessingml" in mime or lower.endswith(".docx"):
        return parse_docx(raw)
    if "spreadsheetml" in mime or lower.endswith(".xlsx"):
        return parse_xlsx(raw)
    if "html" in mime or lower.endswith((".html", ".htm")):
        return parse_html(raw)
    if "json" in mime or lower.endswith(".json"):
        return parse_json(raw)
    if lower.endswith((".md", ".markdown", ".txt")) or mime.startswith("text/"):
        return parse_markdown_or_text(raw)
    raise NotImplementedError(f"unsupported mime: {mime}")


# ── 资源限制与流式（G4：XLSX 10万行、JSON>5MB 流式）──────────────────────────


def parse_xlsx_with_limits(raw: bytes, max_rows: int = 100_000) -> ParseResult:
    from io import BytesIO

    from openpyxl import load_workbook

    workbook = load_workbook(BytesIO(raw), read_only=True, data_only=True)
    total_rows = 0
    root = TreeNode(type="document")
    for sheet in workbook.worksheets:
        sheet_node = TreeNode(type="chapter", text=sheet.title)
        for row in sheet.iter_rows(values_only=True):
            total_rows += 1
            if total_rows > max_rows:
                raise ValueError("row-limit-exceeded")
            cells = ["" if v is None else str(v) for v in row]
            if any(cells):
                sheet_node.children.append(TreeNode(type="row", text=" | ".join(cells)))
        root.children.append(sheet_node)
    return ParseResult(tree=root, pipeline_version=PIPELINE_VERSION)


def parse_json_streamed(raw: bytes) -> ParseResult:
    """≤5MB 直接解析；>5MB 用 ijson 流式（PRD §9.2 / operational-baseline）。"""
    if len(raw) <= 5 * 1024 * 1024:
        return parse_json(raw)
    import ijson

    root = TreeNode(type="document")
    count = 0
    for item in ijson.items(__import__("io").BytesIO(raw), "items.item"):
        count += 1
        if isinstance(item, dict):
            node = TreeNode(type="paragraph", text=json.dumps(item, ensure_ascii=False, sort_keys=True))
            root.children.append(node)
        else:
            root.children.append(TreeNode(type="paragraph", text=str(item)))
    if count == 0:
        return parse_json(raw)
    return ParseResult(tree=root, pipeline_version=PIPELINE_VERSION + "+streamed")
