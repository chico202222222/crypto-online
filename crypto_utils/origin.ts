/**
 * Helper centralizado para validação e resolução de origens permitidas (CORS e CSRF).
 */

export function parseConfiguredOrigins(): string[] {
  const envVal = [
    process.env.ALLOWED_ORIGIN,
    process.env.ALLOWED_ORIGINS,
  ]
    .filter(Boolean)
    .join(",");

  if (!envVal) return [];

  return envVal
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

export function getAllowedOrigins(requestUrl?: string, requestHeaders?: Headers | null): string[] {
  const allowed = new Set<string>();

  // Portas locais padrão
  allowed.add("http://localhost:3000");
  allowed.add("http://127.0.0.1:3000");
  allowed.add("http://localhost:3001");
  allowed.add("http://127.0.0.1:3001");
  allowed.add("http://localhost:3002");
  allowed.add("http://127.0.0.1:3002");

  // Origem da URL da requisição
  if (requestUrl) {
    try {
      allowed.add(new URL(requestUrl).origin);
    } catch {}
  }

  // Origem a partir dos cabeçalhos Host / X-Forwarded-Host
  if (requestHeaders) {
    const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
    const proto = requestHeaders.get("x-forwarded-proto") || (requestUrl?.startsWith("https") ? "https" : "http");
    if (host) {
      allowed.add(`${proto}://${host}`);
    }
  }

  // Origens das variáveis de ambiente
  for (const envOrigin of parseConfiguredOrigins()) {
    if (envOrigin !== "*") {
      allowed.add(envOrigin);
      try {
        allowed.add(new URL(envOrigin).origin);
      } catch {}
    }
  }

  return Array.from(allowed);
}

export function isOriginAllowed(
  origin: string | null | undefined,
  request?: { url: string; headers: Headers } | Request | null
): boolean {
  // Requisições same-origin ou internas que não enviam cabeçalho Origin são permitidas
  if (!origin) return true;

  // Wildcard configurado explicitamente
  const configured = parseConfiguredOrigins();
  if (configured.includes("*")) {
    return true;
  }

  // Qualquer porta em localhost ou 127.0.0.1 é sempre liberada (desenvolvimento / balanceamento)
  if (isLocalhostOrigin(origin)) {
    return true;
  }

  const requestUrl = request ? request.url : undefined;
  const requestHeaders = request ? (request instanceof Request ? request.headers : request.headers) : null;
  const allowed = getAllowedOrigins(requestUrl, requestHeaders);

  return allowed.includes(origin);
}
