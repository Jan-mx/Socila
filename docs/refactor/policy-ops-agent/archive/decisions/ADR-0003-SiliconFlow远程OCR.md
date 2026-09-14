# ADR-0003：SiliconFlow PaddleOCR-VL-1.5远程OCR

- 状态：Accepted
- 日期：2026-08-30
- 影响阶段：Stage 05、06

## 背景

4核4GB服务器无法稳定承载本地PaddleOCR-VL或完整Docling流水线。SiliconFlow当前账号的模型列表已确认可见 `PaddlePaddle/PaddleOCR-VL-1.5`。

## 决策

- 使用SiliconFlow `PaddlePaddle/PaddleOCR-VL-1.5`处理扫描PDF和图片。
- 文本PDF同时使用PyMuPDF原生文本和OCR-VL版面结果。
- OCR只处理公开政策文件，不处理用户个人资料。
- Stage 05真实样本验证前只标记“模型可见”，不宣称推理接口已通过。

## 备选方案

| 方案 | 未选择原因 |
| --- | --- |
| 服务器本地部署OCR-VL | 4GB内存不足且与业务服务争抢资源 |
| 仅PyMuPDF | 无法处理扫描件、图片文字和复杂表格 |
| 未经批准自动切换其他VLM | 质量、费用和输出契约不可控 |

## 后果与复审

- 增加API费用、限流和模型下线风险。
- 必须保存原件、页面哈希、模型和trace ID。
- 模型下线、质量不达标或文档禁止出域时复审。
