# 首期官方政策来源注册表

## 使用规则

- 只有本表启用的域名允许自动抓取。
- 新来源必须核实主办机关、公开栏目、robots/访问规则和内容权威级别。
- 转载页只作发现线索，最终引用优先使用发文机关或政府公报原文。
- 政策解读不能替代规范性文件，但可作为解释证据单独索引。

## 来源矩阵

| 地区 | 机关类型 | 域名 | 初始入口 | 优先级 | 频率 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 国家 | 中国政府网 | `www.gov.cn` | 政策/国务院文件与政府公报 | P0 | 每周 | enabled |
| 国家 | 人力资源和社会保障部 | `www.mohrss.gov.cn` | 社会保障政策文件 | P0 | 每周 | enabled |
| 国家 | 国家医疗保障局 | `www.nhsa.gov.cn` | 政策法规/政策解读 | P0 | 每周 | enabled |
| 上海 | 上海市政府 | `www.shanghai.gov.cn` | 政策文件与政府公报 | P0 | 每周 | enabled |
| 上海 | 上海市人社局 | `rsj.sh.gov.cn` | 规范性文件/其他文件/政策解读 | P0 | 每周 | enabled |
| 上海 | 上海市医保局 | `ybj.sh.gov.cn` | 政策文件/政策解读 | P0 | 每周 | enabled |
| 广东 | 广东省政府 | `www.gd.gov.cn` | 政策文件与政府公报 | P0 | 每周 | enabled |
| 广东 | 广东省人社厅 | `hrss.gd.gov.cn` | 政策法规/通知公告 | P0 | 每周 | enabled |
| 广东 | 广东省医保局 | `hsa.gd.gov.cn` | 省级医保政策/政策解读 | P0 | 每周 | enabled |
| 四川 | 四川省政府 | `www.sc.gov.cn` | 政策文件库与政府公报 | P0 | 每周 | enabled |
| 四川 | 四川省人社厅 | `rst.sc.gov.cn` | 政策法规/政府信息公开 | P0 | 每周 | enabled |
| 四川 | 四川省医保局 | `ylbzj.sc.gov.cn` | 行政规范性文件/政策解读 | P0 | 每周 | enabled |

## 来源记录字段

- `sourceId`、`jurisdictionCode`、`authorityName`、`authorityType`。
- `baseUrl`、`allowedHosts`、`entryUrls`、`adapterType`。
- `contentTypes`：正式文件、政府公报、政策解读、通知公告。
- `priority`、`schedule`、`enabled`、`owner`。
- `lastSuccessAt`、`lastHash`、`failureCount`、`reviewNotes`。

## 采集边界

- 自动跟随重定向后仍必须处于`allowedHosts`。
- 附件CDN域名需作为具体来源的从属白名单单独登记。
- 不自动抓取评论、问答社区、微信公众号转载和搜索引擎缓存。
- 需要登录、验证码或高频反爬时转人工上传，不绕过站点控制。
