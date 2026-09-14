/**
 * WI-20260914-01（PMG-FR-022/NFR-004）：异步子进程helper契约。
 *
 * CI #23与本地复现均出现vitest 3.2.6未处理错误`[vitest-worker]: Timeout calling "onTaskUpdate"`
 * （birpc 60秒RPC超时）：RCL集成测试以`spawnSync`连续阻塞worker事件循环（tsx CLI×N +
 * seed + pg_dump/pg_restore）超过60秒，主进程的RPC响应无法被处理。即使全部用例通过，
 * 该未处理错误也使`npm run test:db`退出1。根因修复：子进程调用改为异步，worker事件循环
 * 在子进程运行期间保持响应。纯单元：只使用当前Node可执行文件运行内联脚本。
 */
import { describe, expect, it } from "vitest";
import { runSubprocess } from "../run-subprocess";

const node = process.execPath;

describe("runSubprocess（异步子进程，不阻塞事件循环）", () => {
  it("透传退出码并分别捕获stdout/stderr", async () => {
    const r = await runSubprocess(node, ["-e", 'process.stdout.write("out-ok"); process.stderr.write("err-ok"); process.exit(3)']);
    expect(r).toMatchObject({ code: 3, stdout: "out-ok", stderr: "err-ok", timedOut: false });
  });

  it("stdin输入原样送达子进程（Buffer）", async () => {
    const payload = Buffer.from("héllo\n二进制\u0000tail", "utf8");
    const r = await runSubprocess(
      node,
      ["-e", 'const c=[];process.stdin.on("data",d=>c.push(d));process.stdin.on("end",()=>{const b=Buffer.concat(c);process.stdout.write(String(b.length));process.exit(0)})'],
      { input: payload },
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(String(payload.length));
  });

  it("子进程运行期间事件循环保持响应（根因属性：定时器在子进程结束前触发）", async () => {
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 50);
    try {
      const r = await runSubprocess(node, ["-e", "setTimeout(()=>process.exit(0), 700)"]);
      expect(r.code).toBe(0);
    } finally {
      clearInterval(timer);
    }
    expect(ticks).toBeGreaterThanOrEqual(5);
  });

  it("超时：终止子进程并返回code=-1与timedOut=true", async () => {
    const r = await runSubprocess(node, ["-e", "setTimeout(()=>process.exit(0), 10000)"], { timeoutMs: 300 });
    expect(r.code).toBe(-1);
    expect(r.timedOut).toBe(true);
  });

  it("可执行文件不存在：不抛出，code=-1且stderr含错误信息", async () => {
    const r = await runSubprocess("definitely-not-a-real-command-xyz", ["--v"]);
    expect(r.code).toBe(-1);
    expect(r.stderr.length).toBeGreaterThan(0);
  });

  it("env覆盖生效且默认继承process.env", async () => {
    const r = await runSubprocess(node, ["-e", 'process.stdout.write(String(process.env.RUN_SUBPROCESS_TEST_VAR))'], {
      env: { ...process.env, RUN_SUBPROCESS_TEST_VAR: "v1" },
    });
    expect(r.stdout).toBe("v1");
  });
});
