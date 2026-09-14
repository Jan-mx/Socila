# 官方来源白名单注册表（v1）

> 本文件是采集模块的唯一抓取白名单（RAG-FR-001 / PRD §6）。新增来源必须经管理员确认后在此登记。

## 国家

- **www.gov.cn**
- **www.mohrss.gov.cn**
- **www.nhsa.gov.cn**

## 上海

- **www.shanghai.gov.cn**
- **hrss.sh.gov.cn**
- **ywtb.sh.gov.cn**
- **wsjkw.sh.gov.cn**

## 广东

- **www.gd.gov.cn**
- **hrss.gd.gov.cn**
- **ssl.gd.gov.cn**

## 四川

- **www.sc.gov.cn**
- **rst.sc.gov.cn**
- **ylbz.sc.gov.cn**

## 限制约定

- 抓取频率：每周一次（由 Celery Beat 调度）。
- 单文件大小上限：HTML≤5MB，PDF≤50MB/200页，DOCX≤25MB，XLSX≤20MB/10万行，JSON≤20MB，Markdown/TXT≤10MB。
- 重定向仅允许白名单域名内跳转；DNS 解析到内网/环回/链路本地地址立即拒绝。
