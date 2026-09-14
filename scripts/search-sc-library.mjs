/**
 * 四川省政策文件库检索（www.sc.gov.cn /resource/v1/api/getList）。
 * 请求：data = md5(payload)+'-'+DES-ECB-PKCS7(payload,'szzcwjkey') hex；
 * 响应：data字段为DES-ECB hex → 解密为JSON。只读探测，不落盘证据。
 * 用法：node scripts/search-sc-library.mjs --title <关键词> [--ref-no <文号>] [--page N]
 */
import crypto from "node:crypto";

const KEY = "szzcwjkey";
const args = process.argv.slice(2);
function argOf(flag, def = "") {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
}
const title = argOf("--title");
const refNo = argOf("--ref-no");
const pageNum = Number(argOf("--page", "1"));

function desEncryptHex(msg) {
  // CryptoJS DES 仅读取前8字节（'szzcwjkey'为9字节，末字节被忽略）。
  const c = crypto.createCipheriv("des-ecb", Buffer.from(KEY, "utf8").subarray(0, 8), null);
  return Buffer.concat([c.update(msg, "utf8"), c.final()]).toString("hex");
}
function desDecryptHex(hex) {
  const d = crypto.createDecipheriv("des-ecb", Buffer.from(KEY, "utf8").subarray(0, 8), null);
  return Buffer.concat([d.update(Buffer.from(hex, "hex")), d.final()]).toString("utf8");
}

const payload = JSON.stringify({
  title,
  refNo,
  policyType: "",
  ectLevel: "",
  ztClass: "",
  tsClass: "",
  validity: "",
  opeStatus: "",
  timeRang: "",
  tagT1: "",
  tagT2: "",
  tagT3: "",
  tagT4: "",
  tagT5: "",
  tagT6: "",
  tagT7: "",
  tagT8: "",
  tagT9: "",
  pageSize: 10,
  pageNum,
  queryQxqt: true,
});
const q = `${crypto.createHash("md5").update(payload).digest("hex")}-${desEncryptHex(payload)}`;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const res = await fetch(
  `https://www.sc.gov.cn/resource/v1/api/getList?data=${encodeURIComponent(q)}`,
  { headers: { "User-Agent": UA, Referer: "https://www.sc.gov.cn/10462/scszcwjkss/scszcwjkss.shtml" } },
);
const msg = await res.json();
if (!msg?.data) {
  console.error("[sc-library] 响应异常：", JSON.stringify(msg).slice(0, 200));
  process.exit(1);
}
const data = JSON.parse(desDecryptHex(msg.data));
console.log(`total=${data.totalCount} pages=${data.totalPage}`);
for (const item of data.list ?? []) {
  console.log(
    `[${item.refNo || "无文号"}] ${item.pubTime?.slice(0, 10) ?? ""} ${item.title} => ${item.sourceAddress}`,
  );
}
