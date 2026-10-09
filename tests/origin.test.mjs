import test from "node:test";
import assert from "node:assert/strict";
import { isOriginAllowed, isLocalhostOrigin } from "../crypto_utils/origin.ts";

test("isLocalhostOrigin identifica localhost, 127.0.0.1 e rejeita domínios externos", () => {
  assert.equal(isLocalhostOrigin("http://localhost:3000"), true);
  assert.equal(isLocalhostOrigin("http://localhost:8080"), true);
  assert.equal(isLocalhostOrigin("http://127.0.0.1:3000"), true);
  assert.equal(isLocalhostOrigin("http://127.0.0.1:18080"), true);
  assert.equal(isLocalhostOrigin("http://0.0.0.0:3000"), true);
  assert.equal(isLocalhostOrigin("https://evil-localhost.com"), false);
  assert.equal(isLocalhostOrigin("https://localhost.evil.com"), false);
  assert.equal(isLocalhostOrigin("https://google.com"), false);
});

test("isOriginAllowed permite same-origin (sem cabeçalho Origin)", () => {
  assert.equal(isOriginAllowed(null), true);
  assert.equal(isOriginAllowed(undefined), true);
  assert.equal(isOriginAllowed(""), true);
});

test("isOriginAllowed permite qualquer porta de localhost e 127.0.0.1", () => {
  assert.equal(isOriginAllowed("http://localhost:3000"), true);
  assert.equal(isOriginAllowed("http://localhost:3002"), true);
  assert.equal(isOriginAllowed("http://localhost:5173"), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:3000"), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:18080"), true);
});

test("isOriginAllowed permite origem baseada nos headers da requisição", () => {
  const req = new Request("https://crypto-online.up.railway.app/api/auth/logout", {
    headers: {
      "host": "crypto-online.up.railway.app",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(isOriginAllowed("https://crypto-online.up.railway.app", req), true);
});

test("isOriginAllowed bloqueia origens estranhas não autorizadas", () => {
  const req = new Request("http://localhost:3000/api/auth/login");
  assert.equal(isOriginAllowed("https://hacker.com", req), false);
  assert.equal(isOriginAllowed("http://phishing.site", req), false);
});
