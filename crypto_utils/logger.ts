/**
 * Logger estruturado do Mercury (lado Next.js).
 *
 * - Produção: uma linha JSON por evento (pronto para Cloud Logging, Loki, Datadog).
 * - Desenvolvimento: linha legível `HH:MM:SS.mmm LEVEL mensagem chave=valor`.
 * - Segredos (senha, token, cookie, 2FA, hash...) são redigidos automaticamente.
 *
 * Variáveis de ambiente:
 *   LOG_LEVEL   debug | info | warn | error  (padrão: info em produção, debug no resto)
 *   LOG_FORMAT  json | pretty                (padrão: json em produção, pretty no resto)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /pass|secret|token|cookie|authorization|totp|two_?factor|backup|hash|otp$|api_?key/i;
const MAX_DEPTH = 4;
const MAX_STRING = 500;
const MAX_ARRAY = 20;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

function activeLevel(): number {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw && raw in LEVELS) return LEVELS[raw as LogLevel];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

function isJsonFormat(): boolean {
  const format = process.env.LOG_FORMAT?.toLowerCase();
  if (format === "json") return true;
  if (format === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

/** Remove segredos e limita tamanho/profundidade para que nenhum objeto vaze ou exploda o log. */
export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => redact(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(item, depth + 1);
  }
  return output;
}

function oneLine(value: unknown): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return text.replace(/[\r\n\t]+/g, " ");
}

function write(level: LogLevel, base: LogFields, message: string, fields?: LogFields) {
  if (LEVELS[level] < activeLevel()) return;

  const data = redact({ ...base, ...fields }) as Record<string, unknown>;
  const timestamp = new Date().toISOString();
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (isJsonFormat()) {
    sink(JSON.stringify({ ...data, timestamp, level, message }));
    return;
  }

  const rest = Object.entries(data)
    .map(([key, item]) => `${key}=${oneLine(item)}`)
    .join(" ");
  sink(`${timestamp.slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${oneLine(message)}${rest ? ` ${rest}` : ""}`);
}

export function createLogger(base: LogFields = {}): Logger {
  return {
    debug: (message, fields) => write("debug", base, message, fields),
    info: (message, fields) => write("info", base, message, fields),
    warn: (message, fields) => write("warn", base, message, fields),
    error: (message, fields) => write("error", base, message, fields),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

export const logger = createLogger({ service: "mercury-web" });

/**
 * Reaproveita o x-request-id recebido (Nginx ou cliente) somente se tiver formato seguro;
 * caso contrário gera um novo. Evita injeção de conteúdo arbitrário nos logs.
 */
export function resolveRequestId(raw: string | null | undefined): string {
  return raw && REQUEST_ID_PATTERN.test(raw) ? raw : crypto.randomUUID();
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

/** `joao@exemplo.com` -> `j***@exemplo.com`. Texto sem formato de e-mail nunca é repetido no log. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "[invalid]";
  return `${email[0]}***@${email.slice(at + 1, at + 101)}`;
}

/** Logger já contextualizado com o id da requisição (definido no proxy.ts) e o IP do cliente. */
export function requestLogger(request: Request, component: string): Logger {
  return logger.child({
    component,
    requestId: resolveRequestId(request.headers.get("x-request-id")),
    ip: getClientIp(request.headers),
  });
}
