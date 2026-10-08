// Configurações padrão de rate limit (Totalmente em memória - sem dependência de Redis)
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const LOGIN_MAX_ATTEMPTS = 10;

const API_WINDOW_MS = 60 * 1000; // 1 minuto
const API_MAX_REQUESTS = 120; // 120 requisições por minuto por IP

export interface RateRecord {
  count: number;
  reset: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
  retryAfterSeconds?: number;
}

// Armazenamento em memória autônomo com janela deslizante
const memoryStore = new Map<string, RateRecord>();

// Limpeza periódica de memória para evitar vazamento (memory leak)
function pruneExpiredEntries(now: number) {
  if (memoryStore.size > 2000) {
    for (const [key, value] of memoryStore) {
      if (value.reset <= now) {
        memoryStore.delete(key);
      }
    }
  }
}

/**
 * Mecanismo de rate limiting em memória com janela deslizante
 */
export function checkMemoryRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  pruneExpiredEntries(now);

  const existing = memoryStore.get(key);
  const record: RateRecord =
    !existing || existing.reset <= now
      ? { count: 0, reset: now + windowMs }
      : existing;

  record.count += 1;
  memoryStore.set(key, record);

  const allowed = record.count <= maxAttempts;
  const remaining = Math.max(0, maxAttempts - record.count);
  const retryAfterSeconds = allowed ? undefined : Math.max(1, Math.ceil((record.reset - now) / 1000));

  return {
    allowed,
    remaining,
    reset: Math.floor(record.reset / 1000),
    retryAfterSeconds,
  };
}

/**
 * Validação de tentativas de login por e-mail ou IP
 * 100% autônomo em memória (sem dependência de Redis)
 */
export async function checkLoginRateLimit(
  email: string
): Promise<RateLimitResult> {
  const key = `login:${email.trim().toLowerCase()}`;
  return checkMemoryRateLimit(key, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
}

/**
 * Rate limit geral para rotas da API (/api/*)
 */
export function checkApiRateLimit(
  identifier: string
): RateLimitResult {
  const key = `api:${identifier}`;
  return checkMemoryRateLimit(key, API_MAX_REQUESTS, API_WINDOW_MS);
}

/**
 * Limpa o histórico de rate limit para uma chave específica (ex: após login bem-sucedido)
 */
export function clearRateLimit(email: string): void {
  const key = `login:${email.trim().toLowerCase()}`;
  memoryStore.delete(key);
}
