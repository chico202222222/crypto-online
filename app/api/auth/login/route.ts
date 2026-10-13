import { NextResponse } from "next/server";
import {
  comparePassword,
  getConfiguredUser,
  isAuthConfigured,
  isOriginAllowed,
  setSessionCookies,
  verifyTwoFactorCode,
} from "@/crypto_utils";
import { checkLoginRateLimit } from "@/crypto_utils/rate-limit";
import { loginSchema } from "@/login/parsing";
import { maskEmail, requestLogger } from "@/crypto_utils/logger";

const ERROR_HEADERS = { "Cache-Control": "no-store" };

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const isAllowed = isOriginAllowed(origin, request);
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": isAllowed && origin ? origin : "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: Request) {
  const log = requestLogger(request, "auth");
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin, request)) {
    log.warn("login blocked: origin not allowed", { origin });
    return NextResponse.json({ status: "error", message: "Origem não permitida." }, { status: 403, headers: ERROR_HEADERS });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ status: "error", message: "Envie JSON." }, { status: 415, headers: ERROR_HEADERS });
  }

  if (!isAuthConfigured()) {
    log.error("login unavailable: auth not configured");
    return NextResponse.json({ status: "error", message: "Autenticação não configurada." }, { status: 503, headers: ERROR_HEADERS });
  }

  try {
    const raw = await request.text();
    if (raw.length > 4096) {
      return NextResponse.json({ status: "error", message: "Requisição muito grande." }, { status: 413, headers: ERROR_HEADERS });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ status: "error", message: "JSON inválido." }, { status: 400, headers: ERROR_HEADERS });
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: "error", message: "Dados de formulário inválidos." }, { status: 400, headers: ERROR_HEADERS });
    }

    const { email, password, rememberMe, twoFactorCode } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const rate = await checkLoginRateLimit(normalizedEmail);
    if (!rate.allowed) {
      log.warn("login rate limited", { email: maskEmail(normalizedEmail), retryAfterSeconds: rate.retryAfterSeconds });
      return NextResponse.json(
        { status: "error", message: "Muitas tentativas. Tente novamente mais tarde." },
        { status: 429, headers: { ...ERROR_HEADERS, "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const user = await getConfiguredUser(normalizedEmail);
    if (!user || !comparePassword(password, user.passwordHash)) {
      // O motivo (usuário inexistente x senha errada) fica fora do log para não facilitar enumeração.
      log.warn("login failed: invalid credentials", { email: maskEmail(normalizedEmail) });
      return NextResponse.json({ status: "error", message: "Credenciais inválidas." }, { status: 401, headers: ERROR_HEADERS });
    }

    if (!twoFactorCode) {
      return NextResponse.json(
        { status: "require_2fa", message: "Informe o código do autenticador." },
        { status: 200, headers: ERROR_HEADERS }
      );
    }

    if (!verifyTwoFactorCode(twoFactorCode, user.totpSecret, user.backupCode)) {
      log.warn("login failed: invalid 2fa", { email: maskEmail(normalizedEmail) });
      return NextResponse.json({ status: "error", message: "Código 2FA inválido ou expirado." }, { status: 401, headers: ERROR_HEADERS });
    }

    const response = NextResponse.json(
      { status: "success", user: { email: normalizedEmail, role: user.role ?? "aprendiz" } },
      { status: 200, headers: ERROR_HEADERS }
    );
    setSessionCookies(response, {
      email: normalizedEmail,
      role: user.role ?? "aprendiz",
      rememberMe: Boolean(rememberMe),
    });
    log.info("login success", { email: maskEmail(normalizedEmail), rememberMe: Boolean(rememberMe) });
    return response;
  } catch (error) {
    log.error("login failed: unexpected error", { error });
    return NextResponse.json(
      { status: "error", message: "Não foi possível processar o login." },
      { status: 503, headers: ERROR_HEADERS }
    );
  }
}
