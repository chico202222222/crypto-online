import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, isOriginAllowed } from "@/crypto_utils";
import { checkApiRateLimit } from "@/crypto_utils/rate-limit";

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

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
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

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

  // 3. Verificação de autenticação de sessão
  const token = request.cookies.get("crypto_session")?.value;
  const authenticated = token ? (await verifySessionToken(token)).valid : false;

  if (pathname === "/login") {
    return authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
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
  const response = NextResponse.next();
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
