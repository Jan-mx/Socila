/**
 * Structured logging for SSP application.
 *
 * Outputs JSON to stdout for Vercel/production environments.
 * Each log entry includes a request_id for correlation.
 */

import { v4 as uuidv4 } from "uuid";

export type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  request_id: string;
  event: string;
  duration_ms?: number;
  [key: string]: unknown;
}

/**
 * Create a request-scoped logger with a unique request_id.
 */
export function createRequestLogger(requestId?: string) {
  const id = requestId ?? uuidv4();

  function log(level: LogLevel, event: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      request_id: id,
      event,
      ...data,
    };

    // Use structured JSON output (Vercel captures stdout)
    const output = JSON.stringify(entry);
    if (level === "error") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }

  return {
    requestId: id,

    info(event: string, data?: Record<string, unknown>) {
      log("info", event, data);
    },

    warn(event: string, data?: Record<string, unknown>) {
      log("warn", event, data);
    },

    error(event: string, data?: Record<string, unknown>) {
      log("error", event, data);
    },

    /**
     * Time an async operation and log it.
     */
    async time<T>(
      event: string,
      fn: () => Promise<T>,
      meta?: Record<string, unknown>,
    ): Promise<T> {
      const start = performance.now();
      try {
        const result = await fn();
        const duration_ms = Math.round(performance.now() - start);
        log("info", event, { duration_ms, status: "ok", ...meta });
        return result;
      } catch (err) {
        const duration_ms = Math.round(performance.now() - start);
        log("error", event, {
          duration_ms,
          status: "error",
          error_message: err instanceof Error ? err.message : String(err),
          ...meta,
        });
        throw err;
      }
    },
  };
}

export type RequestLogger = ReturnType<typeof createRequestLogger>;
