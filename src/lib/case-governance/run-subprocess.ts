/**
 * 异步子进程helper（WI-20260914-01）。
 *
 * RCL集成测试需要以子进程运行受控CLI（tsx）、seed与容器内pg_dump/pg_restore/psql。
 * 以`spawnSync`连续阻塞vitest worker事件循环超过60秒会触发birpc RPC超时
 * （`[vitest-worker]: Timeout calling "onTaskUpdate"`）并作为未处理错误使
 * `npm run test:db`退出1（CI #23与本地均复现）。本helper以`spawn`异步等待子进程，
 * 保持事件循环响应；语义对齐`spawnSync`常用字段：退出码（被信号终止/超时/无法启动为-1）、
 * utf-8 stdout/stderr、stdin输入、超时强制终止、maxBuffer保护。
 */
import { spawn } from "node:child_process";

export interface SubprocessResult {
  /** 子进程退出码；被信号终止、超时或无法启动时为-1。 */
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface SubprocessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** 写入子进程stdin后关闭；未提供时立即关闭stdin。 */
  input?: Buffer | string;
  /** 超过该时长强制终止（SIGKILL），结果code=-1、timedOut=true。 */
  timeoutMs?: number;
  /** stdout/stderr各自累计上限（字节）；超过即终止并在stderr追加说明。 */
  maxBuffer?: number;
}

export function runSubprocess(
  command: string,
  args: string[],
  options: SubprocessOptions = {},
): Promise<SubprocessResult> {
  const { cwd, env = process.env, input, timeoutMs, maxBuffer = 512 * 1024 * 1024 } = options;
  return new Promise((resolve) => {
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;
    let settled = false;
    let spawnError: Error | null = null;

    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      const stderrText = Buffer.concat(errChunks).toString("utf8");
      resolve({
        code: timedOut || signal !== null || code === null ? -1 : code,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: spawnError ? `${stderrText}${stderrText ? "\n" : ""}${spawnError.message}` : stderrText,
        timedOut,
      });
    };

    const overflow = (stream: "stdout" | "stderr") => {
      errChunks.push(Buffer.from(`\n[runSubprocess] ${stream} exceeded maxBuffer=${maxBuffer}; process killed\n`, "utf8"));
      child.kill("SIGKILL");
    };

    const timer =
      timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, timeoutMs)
        : null;

    child.stdout.on("data", (d: Buffer) => {
      outBytes += d.length;
      if (outBytes > maxBuffer) return overflow("stdout");
      outChunks.push(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      errBytes += d.length;
      if (errBytes > maxBuffer) return overflow("stderr");
      errChunks.push(d);
    });
    child.on("error", (err) => {
      // 无法启动（如ENOENT）：'close'可能不再触发，直接以-1结束。
      spawnError = err;
      finish(null, null);
    });
    child.on("close", (code, signal) => finish(code, signal));

    // stdin写入错误（子进程提前退出导致EPIPE）不应使Promise悬挂或抛出。
    child.stdin.on("error", () => undefined);
    if (input !== undefined) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}
