import type { NextRequest } from "next/server";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

const globalState = globalThis as typeof globalThis & {
  __sspRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const buckets =
  globalState.__sspRateLimitBuckets ??
  (globalState.__sspRateLimitBuckets = new Map<string, RateLimitBucket>());

function cleanupBuckets(now: number): void {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(req: NextRequest): string {
  // Prefer x-real-ip: on Vercel/edge the platform sets it to the true client IP.
  // x-forwarded-for is client-supplied and its first hop is spoofable (a forged
  // header would otherwise mint a fresh rate-limit bucket per request), so it is
  // only a fallback for environments that don't set x-real-ip.
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return "unknown";
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  cleanupBuckets(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      resetAt,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  if (bucket.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function applyRateLimitHeaders(
  response: Response,
  result: RateLimitResult,
  limit: number,
): void {
  response.headers.set("x-ratelimit-limit", String(limit));
  response.headers.set("x-ratelimit-remaining", String(result.remaining));
  response.headers.set(
    "x-ratelimit-reset",
    String(Math.ceil(result.resetAt / 1000)),
  );
  if (!result.allowed) {
    response.headers.set("retry-after", String(result.retryAfterSeconds));
  }
}

