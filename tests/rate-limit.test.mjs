import assert from "node:assert/strict";
import test from "node:test";
import {
  checkMemoryRateLimit,
  checkLoginRateLimit,
  checkApiRateLimit,
  clearRateLimit,
} from "../crypto_utils/rate-limit.ts";

test("rate limiting em memória permite requisições dentro do limite e bloqueia excessos", () => {
  const testKey = `test-ip-${Date.now()}`;
  const maxAttempts = 3;
  const windowMs = 5000;

  // 1a tentativa
  const res1 = checkMemoryRateLimit(testKey, maxAttempts, windowMs);
  assert.equal(res1.allowed, true);
  assert.equal(res1.remaining, 2);

  // 2a tentativa
  const res2 = checkMemoryRateLimit(testKey, maxAttempts, windowMs);
  assert.equal(res2.allowed, true);
  assert.equal(res2.remaining, 1);

  // 3a tentativa
  const res3 = checkMemoryRateLimit(testKey, maxAttempts, windowMs);
  assert.equal(res3.allowed, true);
  assert.equal(res3.remaining, 0);

  // 4a tentativa (deve bloquear)
  const res4 = checkMemoryRateLimit(testKey, maxAttempts, windowMs);
  assert.equal(res4.allowed, false);
  assert.equal(res4.remaining, 0);
  assert.ok(res4.retryAfterSeconds && res4.retryAfterSeconds > 0);
});

test("checkLoginRateLimit funciona sem Redis e reseta com clearRateLimit", async () => {
  const email = `test-${Date.now()}@exemplo.com`;

  // Executa checagem de login
  const res = await checkLoginRateLimit(email);
  assert.equal(res.allowed, true);

  // Limpa o rate limit
  clearRateLimit(email);

  // Verifica que nova checagem é permitida e reiniciada
  const fresh = await checkLoginRateLimit(email);
  assert.equal(fresh.allowed, true);
  assert.equal(fresh.remaining, 9); // 10 max - 1 tentativa
});

test("checkApiRateLimit valida chamadas por identificador de IP", () => {
  const ip = `192.168.1.${Math.floor(Math.random() * 255)}`;
  const res = checkApiRateLimit(ip);
  assert.equal(res.allowed, true);
  assert.equal(res.remaining, 119); // 120 max - 1 tentativa
});
