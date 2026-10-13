import crypto from "node:crypto";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "mercury_session";
export const FIREBASE_SESSION_COOKIE_NAME = "__session";
export const LEGACY_SESSION_COOKIE_NAME = "crypto_session";
export const USER_INFO_COOKIE_NAME = "mercury_user";
export const SESSION_ACTIVE_COOKIE_NAME = "mercury_session_active";
export const COOKIE_CONSENT_NAME = "mercury_cookie_consent";

export const ALL_SESSION_COOKIES = [
  SESSION_COOKIE_NAME,
  FIREBASE_SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  USER_INFO_COOKIE_NAME,
  SESSION_ACTIVE_COOKIE_NAME,
] as const;

export interface SessionCookiePayload {
  email: string;
  role: string;
  rememberMe?: boolean;
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres.");
  }
  return secret;
}

export function generateSessionToken(email: string, maxAgeSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ email: email.trim().toLowerCase(), iat: now, exp: now + maxAgeSeconds })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Opções seguras para cookies HTTP-Only de autenticação
 */
export function getAuthCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

/**
 * Opções para cookies de uso e estado da sessão (legíveis no cliente para UI / telemetria não-sensível)
 */
export function getClientSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/**
 * Extrai o token de sessão da requisição, verificando em ordem de prioridade:
 * 1. mercury_session
 * 2. __session (padrão obrigatório do Firebase Hosting)
 * 3. crypto_session (fallback legado)
 */
export function extractSessionToken(
  cookiesReader: { get: (name: string) => { value: string } | undefined }
): string | null {
  return (
    cookiesReader.get(SESSION_COOKIE_NAME)?.value ||
    cookiesReader.get(FIREBASE_SESSION_COOKIE_NAME)?.value ||
    cookiesReader.get(LEGACY_SESSION_COOKIE_NAME)?.value ||
    null
  );
}

/**
 * Aplica todos os cookies de uso de sessão na resposta HTTP:
 * - mercury_session (HttpOnly, Strict)
 * - __session (HttpOnly, Strict - compatível com Firebase Hosting)
 * - crypto_session (HttpOnly, Strict - compatibilidade retroativa)
 * - mercury_user (Client-readable - e-mail e papel do usuário para renderização imediata na UI)
 * - mercury_session_active (Client-readable - indicador booleano de sessão ativa)
 */
export function setSessionCookies(
  response: NextResponse,
  payload: SessionCookiePayload
): { token: string; maxAge: number } {
  const normalizedEmail = payload.email.trim().toLowerCase();
  const maxAge = payload.rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60;
  const token = generateSessionToken(normalizedEmail, maxAge);

  const authOptions = getAuthCookieOptions(maxAge);
  const clientOptions = getClientSessionCookieOptions(maxAge);

  // 1. Cookies protegidos de autenticação (HttpOnly)
  response.cookies.set({ name: SESSION_COOKIE_NAME, value: token, ...authOptions });
  response.cookies.set({ name: FIREBASE_SESSION_COOKIE_NAME, value: token, ...authOptions });
  response.cookies.set({ name: LEGACY_SESSION_COOKIE_NAME, value: token, ...authOptions });

  // 2. Cookies de uso e estado da sessão (Acessíveis pelo cliente para exibir perfil e status)
  const clientUserData = JSON.stringify({
    email: normalizedEmail,
    role: payload.role,
    issuedAt: Math.floor(Date.now() / 1000),
  });
  response.cookies.set({
    name: USER_INFO_COOKIE_NAME,
    value: encodeURIComponent(clientUserData),
    ...clientOptions,
  });

  response.cookies.set({
    name: SESSION_ACTIVE_COOKIE_NAME,
    value: "1",
    ...clientOptions,
  });

  return { token, maxAge };
}

/**
 * Invalida e limpa todos os cookies de sessão associados ao usuário
 */
export function clearSessionCookies(response: NextResponse): void {
  for (const cookieName of ALL_SESSION_COOKIES) {
    response.cookies.set({
      name: cookieName,
      value: "",
      httpOnly: cookieName === USER_INFO_COOKIE_NAME || cookieName === SESSION_ACTIVE_COOKIE_NAME ? false : true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
      maxAge: 0,
    });
  }
}
