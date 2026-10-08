import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const localAttempts = new Map<string, { count: number; reset: number }>();

const distributedLimiter = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Ratelimit({
      redis: Redis.fromEnv(), // ainda n foi setado
      limiter: Ratelimit.slidingWindow(MAX_ATTEMPTS, "15 m"),
      prefix: "crypto-online:login",
    })
  : null;

export async function checkLoginRateLimit(email: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const key = email.trim().toLowerCase();

  if (distributedLimiter) {
    const result = await distributedLimiter.limit(key);
    return {
      allowed: result.success,
      retryAfterSeconds: result.success ? undefined : Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
    };
  }

  // Uma função em produção pode ter várias instâncias: sem Redis, negar login.
  if (process.env.NODE_ENV === "production") throw new Error("Rate limiting compartilhado não configurado.");

  const now = Date.now();
  const previous = localAttempts.get(key);
  const record = !previous || previous.reset <= now ? { count: 0, reset: now + WINDOW_MS } : previous;
  record.count += 1;
  localAttempts.set(key, record);
  if (localAttempts.size > 1000) {
    for (const [address, value] of localAttempts) {
      if (value.reset <= now) localAttempts.delete(address);
    }
  }
  return {
    allowed: record.count <= MAX_ATTEMPTS,
    retryAfterSeconds: record.count <= MAX_ATTEMPTS ? undefined : Math.ceil((record.reset - now) / 1000),
  };
}
