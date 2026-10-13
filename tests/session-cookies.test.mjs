import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_COOKIE_NAME,
  FIREBASE_SESSION_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  USER_INFO_COOKIE_NAME,
  SESSION_ACTIVE_COOKIE_NAME,
  COOKIE_CONSENT_NAME,
  ALL_SESSION_COOKIES,
  getAuthCookieOptions,
  getClientSessionCookieOptions,
  extractSessionToken,
  setSessionCookies,
  clearSessionCookies,
} from "../crypto_utils/session-cookies.ts";

// Mock simples de NextResponse para validar manipulação de cookies
class MockNextResponse {
  constructor() {
    this._cookies = new Map();
    this.cookies = {
      set: (opts) => {
        this._cookies.set(opts.name, opts);
      },
      get: (name) => this._cookies.get(name),
    };
  }
}

test("constantes de cookies e consentimento estão padronizadas", () => {
  assert.equal(COOKIE_CONSENT_NAME, "mercury_cookie_consent");
  assert.ok(ALL_SESSION_COOKIES.includes(SESSION_COOKIE_NAME));
  assert.ok(ALL_SESSION_COOKIES.includes(FIREBASE_SESSION_COOKIE_NAME));
  assert.ok(ALL_SESSION_COOKIES.includes(USER_INFO_COOKIE_NAME));
});

test("getAuthCookieOptions gera flags seguras (httpOnly, sameSite strict, path /)", () => {
  const options = getAuthCookieOptions(3600);
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "strict");
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, 3600);
});

test("getClientSessionCookieOptions gera flags acessíveis ao cliente (httpOnly false, lax)", () => {
  const options = getClientSessionCookieOptions(7200);
  assert.equal(options.httpOnly, false);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.maxAge, 7200);
});

test("extractSessionToken prioriza mercury_session, depois __session, depois crypto_session", () => {
  // 1. mercury_session tem prioridade máxima
  const reader1 = {
    get: (name) => {
      if (name === SESSION_COOKIE_NAME) return { value: "token-mercury" };
      if (name === FIREBASE_SESSION_COOKIE_NAME) return { value: "token-firebase" };
      return undefined;
    },
  };
  assert.equal(extractSessionToken(reader1), "token-mercury");

  // 2. Fallback para __session do Firebase
  const reader2 = {
    get: (name) => {
      if (name === FIREBASE_SESSION_COOKIE_NAME) return { value: "token-firebase" };
      if (name === LEGACY_SESSION_COOKIE_NAME) return { value: "token-legacy" };
      return undefined;
    },
  };
  assert.equal(extractSessionToken(reader2), "token-firebase");

  // 3. Fallback para crypto_session legado
  const reader3 = {
    get: (name) => {
      if (name === LEGACY_SESSION_COOKIE_NAME) return { value: "token-legacy" };
      return undefined;
    },
  };
  assert.equal(extractSessionToken(reader3), "token-legacy");

  // 4. Sem cookies presentes
  const readerEmpty = { get: () => undefined };
  assert.equal(extractSessionToken(readerEmpty), null);
});

test("setSessionCookies define todos os cookies de autenticação e de uso da sessão", () => {
  const previousSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "crypto_prod_secret_998124_a9b8c7"; // 32 chars

  try {
    const res = new MockNextResponse();
    const result = setSessionCookies(res, {
      email: "fran82652@gmail.com",
      role: "administrador",
      rememberMe: true,
    });

    assert.equal(result.maxAge, 7 * 24 * 60 * 60);
    assert.ok(result.token.length > 20);

    // Cookie principal mercury_session
    const mainCookie = res.cookies.get(SESSION_COOKIE_NAME);
    assert.ok(mainCookie);
    assert.equal(mainCookie.value, result.token);
    assert.equal(mainCookie.httpOnly, true);

    // Cookie Firebase __session
    const fbCookie = res.cookies.get(FIREBASE_SESSION_COOKIE_NAME);
    assert.ok(fbCookie);
    assert.equal(fbCookie.value, result.token);
    assert.equal(fbCookie.httpOnly, true);

    // Cookie legado crypto_session
    const legacyCookie = res.cookies.get(LEGACY_SESSION_COOKIE_NAME);
    assert.ok(legacyCookie);
    assert.equal(legacyCookie.value, result.token);

    // Cookie de dados do usuário mercury_user (acessível no client)
    const userCookie = res.cookies.get(USER_INFO_COOKIE_NAME);
    assert.ok(userCookie);
    assert.equal(userCookie.httpOnly, false);
    const parsedUser = JSON.parse(decodeURIComponent(userCookie.value));
    assert.equal(parsedUser.email, "fran82652@gmail.com");
    assert.equal(parsedUser.role, "administrador");

    // Cookie de status ativo mercury_session_active
    const activeCookie = res.cookies.get(SESSION_ACTIVE_COOKIE_NAME);
    assert.ok(activeCookie);
    assert.equal(activeCookie.value, "1");
    assert.equal(activeCookie.httpOnly, false);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("clearSessionCookies invalida todos os cookies de sessão com maxAge = 0", () => {
  const res = new MockNextResponse();
  clearSessionCookies(res);

  for (const cookieName of ALL_SESSION_COOKIES) {
    const cookie = res.cookies.get(cookieName);
    assert.ok(cookie, `Cookie ${cookieName} deve ser definido`);
    assert.equal(cookie.value, "");
    assert.equal(cookie.maxAge, 0);
  }
});
