/**
 * GD统一检索API（search.gd.gov.cn /api/search/all，POST form）。
 * 用法：node scripts/search-gd.mjs "<关键词>" [siteId=186]
 * 仅输出标题+URL（白名单域过滤）；只读探测，不落盘。
 */
const q = process.argv[2];
const site = process.argv[3] ?? "186";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const body = new URLSearchParams({
  keywords: q, keywords_not: "", advance: "true", sort: "smart", gb_ppfs: "1", site_id: site,
  gb_fbjg: "", gb_fbjg_more: "", gb_fwlb_wh: "", gb_ztfl: "", gb_ztfl_more: "",
  gb_start_time: "", gb_end_time: "", position: "", filterType: "", filterId: "",
  searchtype: "", division: "", onlineservice: "", timeRange: "all", type: "", area: "", dep: "",
});
const res = await fetch("https://search.gd.gov.cn/api/search/all", {
  method: "POST",
  headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Referer: `https://search.gd.gov.cn/search/all/${site}` },
  body: body.toString(),
});
const data = await res.json();
const lists = [];
for (const [k, v] of Object.entries(data.data ?? {})) {
  if (v && Array.isArray(v.list)) lists.push([k, v]);
}
for (const [k, v] of lists) {
  for (const item of v.list ?? []) {
    const title = (item.title ?? "").replace(/<[^>]+>/g, "");
    const url = item.url ?? item.jump_url ?? item.link ?? "";
    console.log(`[${k}] ${title} => ${url}`);
  }
  if ((v.total ?? 0) > 0) console.log(`[${k}] total=${v.total}`);
}
