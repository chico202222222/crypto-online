import assert from "node:assert/strict";
import test from "node:test";
import {
  createLogger,
  getClientIp,
  maskEmail,
  redact,
  resolveRequestId,
} from "../crypto_utils/logger.ts";

function captureConsole(run) {
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  console.log = (line) => lines.push(["log", line]);
  console.warn = (line) => lines.push(["warn", line]);
  console.error = (line) => lines.push(["error", line]);
  try {
    run();
  } finally {
    Object.assign(console, original);
  }
  return lines;
}

function withEnv(values, run) {
  const previous = {};
  for (const key of Object.keys(values)) previous[key] = process.env[key];
  Object.assign(process.env, values);
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("redact oculta segredos em qualquer nível e preserva campos comuns", () => {
  const result = redact({
    email: "a@b.c",
    password: "123",
    twoFactorCode: "654321",
    nested: { sessionToken: "abc", cookie: "x", keep: 1 },
    list: [{ passwordHash: "h" }],
  });
  assert.deepEqual(result, {
    email: "a@b.c",
    password: "[REDACTED]",
    twoFactorCode: "[REDACTED]",
    nested: { sessionToken: "[REDACTED]", cookie: "[REDACTED]", keep: 1 },
    list: [{ passwordHash: "[REDACTED]" }],
  });
});

test("redact limita strings longas, profundidade e serializa erros sem stack", () => {
  assert.equal(redact("x".repeat(600)).length, 501);
  const deep = { a: { b: { c: { d: { e: 1 } } } } };
  assert.equal(redact(deep).a.b.c.d, "[Truncated]");
  const error = redact(new Error("falhou"));
  assert.deepEqual(error, { name: "Error", message: "falhou" });
});

test("maskEmail esconde o usuário e nunca repete texto que não é e-mail", () => {
  assert.equal(maskEmail("admin@mercury.app"), "a***@mercury.app");
  assert.equal(maskEmail("sem-arroba"), "[invalid]");
  assert.equal(maskEmail("@semlocal.com"), "[invalid]");
});

test("resolveRequestId reaproveita ids seguros e troca ids suspeitos", () => {
  assert.equal(resolveRequestId("abc12345-req"), "abc12345-req");
  assert.notEqual(resolveRequestId("curto"), "curto");
  const forged = 'abc12345"\n{"level":"error"}';
  assert.match(resolveRequestId(forged), /^[0-9a-f-]{36}$/);
  assert.match(resolveRequestId(null), /^[0-9a-f-]{36}$/);
});

test("getClientIp usa o primeiro x-forwarded-for, depois x-real-ip, depois localhost", () => {
  assert.equal(getClientIp(new Headers({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" })), "10.0.0.1");
  assert.equal(getClientIp(new Headers({ "x-real-ip": "10.0.0.3" })), "10.0.0.3");
  assert.equal(getClientIp(new Headers()), "127.0.0.1");
});

test("formato json emite uma linha parseável com contexto do child e segredos redigidos", () => {
  withEnv({ LOG_FORMAT: "json", LOG_LEVEL: "debug" }, () => {
    const lines = captureConsole(() => {
      createLogger({ service: "t" })
        .child({ requestId: "r-12345678" })
        .info("login", { password: "segredo", status: 200 });
    });
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0][1]);
    assert.equal(entry.level, "info");
    assert.equal(entry.message, "login");
    assert.equal(entry.service, "t");
    assert.equal(entry.requestId, "r-12345678");
    assert.equal(entry.password, "[REDACTED]");
    assert.equal(entry.status, 200);
    assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
  });
});

test("LOG_LEVEL filtra eventos abaixo do nível e warn/error usam os sinks corretos", () => {
  withEnv({ LOG_FORMAT: "json", LOG_LEVEL: "warn" }, () => {
    const lines = captureConsole(() => {
      const log = createLogger();
      log.debug("d");
      log.info("i");
      log.warn("w");
      log.error("e");
    });
    assert.deepEqual(lines.map(([sink]) => sink), ["warn", "error"]);
  });
});

test("formato pretty remove quebras de linha para impedir forja de entradas", () => {
  withEnv({ LOG_FORMAT: "pretty", LOG_LEVEL: "debug" }, () => {
    const lines = captureConsole(() => {
      createLogger().info("evento", { path: "/a\nERROR forjado" });
    });
    assert.equal(lines.length, 1);
    assert.ok(!lines[0][1].includes("\n"));
    assert.match(lines[0][1], /INFO\s+evento path=\/a ERROR forjado/);
  });
});
