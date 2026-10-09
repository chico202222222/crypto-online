import { NextResponse } from "next/server";
import {
  comparePassword,
  generateSessionToken,
  getConfiguredUser,
  isAuthConfigured,
  isOriginAllowed,
  verifyTwoFactorCode,
} from "@/crypto_utils";
import { checkLoginRateLimit } from "@/crypto_utils/rate-limit";
import { loginSchema } from "@/login/parsing";

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
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin, request)) {
    return NextResponse.json({ status: "error", message: "Origem não permitida." }, { status: 403, headers: ERROR_HEADERS });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ status: "error", message: "Envie JSON." }, { status: 415, headers: ERROR_HEADERS });
  }

  if (!isAuthConfigured()) {
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
      return NextResponse.json(
        { status: "error", message: "Muitas tentativas. Tente novamente mais tarde." },
        { status: 429, headers: { ...ERROR_HEADERS, "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const user = await getConfiguredUser(normalizedEmail);
    if (!user || !comparePassword(password, user.passwordHash)) {
      return NextResponse.json({ status: "error", message: "Credenciais inválidas." }, { status: 401, headers: ERROR_HEADERS });
    }

    if (!twoFactorCode) {
      return NextResponse.json(
        { status: "require_2fa", message: "Informe o código do autenticador." },
        { status: 200, headers: ERROR_HEADERS }
      );
    }

    if (!verifyTwoFactorCode(twoFactorCode, user.totpSecret, user.backupCode)) {
      return NextResponse.json({ status: "error", message: "Credenciais inválidas." }, { status: 401, headers: ERROR_HEADERS });
    }

    const maxAge = rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60;
    const response = NextResponse.json(
      { status: "success", user: { email: normalizedEmail } },
      { status: 200, headers: ERROR_HEADERS }
    );
    response.cookies.set({
      name: "crypto_session",
      value: generateSessionToken(normalizedEmail, maxAge),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge,
    });
    return response;
  } catch {
    return NextResponse.json(
      { status: "error", message: "Não foi possível processar o login." },
      { status: 503, headers: ERROR_HEADERS }
    );
  }
}
