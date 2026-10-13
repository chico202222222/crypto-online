import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, isOriginAllowed } from "@/crypto_utils";
import { checkApiRateLimit } from "@/crypto_utils/rate-limit";
import { logger, getClientIp, resolveRequestId } from "@/crypto_utils/logger";

const log = logger.child({ component: "proxy" });

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/mock-authenticator",
  "/api",
  "/api/coins",
  "/api/plot",
]);

function getCorsHeaders(origin: string | null, isAllowed: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-crypto-symbol, x-crypto-network, x-crypto-tier",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (isAllowed && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

function isStaticPath(pathname: string): boolean {
  return pathname.startsWith("/_next/") || pathname === "/favicon.ico";
}

/**
 * Ponto de entrada: gera/valida o x-request-id, repassa para as rotas (header de request),
 * devolve ao cliente e registra uma linha de log por requisição.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticPath(pathname)) {
    return NextResponse.next();
  }

  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const start = performance.now();
  const ip = getClientIp(request.headers);
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  let response: NextResponse;
  try {
    response = await handleRequest(request, requestHeaders, ip);
  } catch (error) {
    log.error("request failed", {
      requestId,
      method: request.method,
      path: pathname,
      durationMs: Math.round(performance.now() - start),
      ip,
      error,
    });
    throw error;
  }

  response.headers.set("x-request-id", requestId);

  const base = {
    requestId,
    method: request.method,
    path: pathname,
    durationMs: Math.round(performance.now() - start),
    ip,
  };

  // NextResponse.next() só encaminha a requisição: o status final é decidido pela rota
  // (que registra o próprio resultado), então não logamos um status que ainda não existe.
  if (response.headers.has("x-middleware-next")) {
    if (isApi) log.info("request forwarded", base);
    else log.debug("request forwarded", base);
    return response;
  }

  const fields = { ...base, status: response.status };
  const status = response.status;
  if (status === 429) log.warn("rate limit", fields);
  else if (status >= 500) log.error("request", fields);
  else if (status >= 400) log.warn("request", fields);
  else log.info("request", fields);

  return response;
}

async function handleRequest(
  request: NextRequest,
  requestHeaders: Headers,
  clientIp: string
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  const origin = request.headers.get("origin");
  const isAllowedOrigin = isOriginAllowed(origin, request);

  // 1. Tratamento de CORS Preflight (OPTIONS) para rotas de API
  if (isApi && request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: getCorsHeaders(origin, isAllowedOrigin),
    });
  }

  // 2. Rate Limiting por IP para rotas de API (120 req/min) - 100% em memória, sem Redis
  if (isApi) {
    const rate = checkApiRateLimit(clientIp);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          status: "error",
          message: "Muitas requisições. Limite de taxa excedido.",
          retryAfterSeconds: rate.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            ...getCorsHeaders(origin, isAllowedOrigin),
            "Retry-After": String(rate.retryAfterSeconds ?? 60),
            "Cache-Control": "no-store",
          },
        }
      );
    }
  }

  // 3. Verificação de autenticação de sessão (suporta mercury_session e fallback crypto_session)
  const token =
    request.cookies.get("mercury_session")?.value ||
    request.cookies.get("crypto_session")?.value;
  const authenticated = token ? (await verifySessionToken(token)).valid : false;

  if (pathname === "/login") {
    return authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : next();
  }

  const isPublic = PUBLIC_PATHS.has(pathname);

  // 4. Bloqueio de rotas de API não autenticadas
  if (isApi && !isPublic && !authenticated) {
    return NextResponse.json(
      { status: "error", message: "Não autenticado." },
      {
        status: 401,
        headers: {
          ...getCorsHeaders(origin, isAllowedOrigin),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  // 5. Bloqueio de páginas protegidas (redireciona para /login)
  if (!isApi && !isPublic && !authenticated) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 6. Requisição permitida: adiciona cabeçalhos CORS nas respostas de API
  const response = next();
  if (isApi) {
    const corsHeaders = getCorsHeaders(origin, isAllowedOrigin);
    Object.entries(corsHeaders).forEach(([key, val]) => {
      response.headers.set(key, val);
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
