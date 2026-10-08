import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  readSqliteUser,
  listSqliteUsers,
  updateSqliteUserRole,
  normalizeRole,
} from "../crypto_utils/sqlite-auth.ts";
import { hasMinPermission, generateTotpCode } from "../crypto_utils/index.ts";

test("normalizeRole mapeia corretamente todas as variações para os 3 níveis", () => {
  assert.equal(normalizeRole("administrador"), "administrador");
  assert.equal(normalizeRole("admin"), "administrador");
  assert.equal(normalizeRole("mestre"), "mestre");
  assert.equal(normalizeRole("trader"), "mestre");
  assert.equal(normalizeRole("aprendiz"), "aprendiz");
  assert.equal(normalizeRole("user"), "aprendiz");
  assert.equal(normalizeRole("desconhecido"), "aprendiz");
  assert.equal(normalizeRole(null), "aprendiz");
});

test("hasMinPermission respeita a hierarquia administrador > mestre > aprendiz", () => {
  // Administrador tem acesso a tudo
  assert.equal(hasMinPermission("administrador", "aprendiz"), true);
  assert.equal(hasMinPermission("administrador", "mestre"), true);
  assert.equal(hasMinPermission("administrador", "administrador"), true);

  // Mestre tem acesso a mestre e aprendiz, mas não administrador
  assert.equal(hasMinPermission("mestre", "aprendiz"), true);
  assert.equal(hasMinPermission("mestre", "mestre"), true);
  assert.equal(hasMinPermission("mestre", "administrador"), false);

  // Aprendiz tem acesso apenas a aprendiz
  assert.equal(hasMinPermission("aprendiz", "aprendiz"), true);
  assert.equal(hasMinPermission("aprendiz", "mestre"), false);
  assert.equal(hasMinPermission("aprendiz", "administrador"), false);
});

test("gerenciamento de usuários e atualização de papéis no banco SQLite", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "crypto-role-test-"));
  const dbPath = path.join(directory, "users.db");
  const previous = { nodeEnv: process.env.NODE_ENV, dbPath: process.env.DB_PATH };

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'aprendiz',
      two_factor_secret TEXT NOT NULL,
      two_factor_enabled INTEGER DEFAULT 1,
      two_factor_backup_code TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const mockHash = "1da19052cb285ae5d2fb70264fbce762:55c86e24ddd88452053bb252d3a9c95fae5598d3a40bb6ad9b4670ec9e104f93";
  const mockSecret = "JBSWY3DPEHPK3PXP";

  db.prepare("INSERT INTO users (email, password, role, two_factor_secret, two_factor_enabled) VALUES (?, ?, ?, ?, 1)")
    .run("test.admin@crypto.test", mockHash, "administrador", mockSecret);
  db.prepare("INSERT INTO users (email, password, role, two_factor_secret, two_factor_enabled) VALUES (?, ?, ?, ?, 1)")
    .run("test.aprendiz@crypto.test", mockHash, "aprendiz", mockSecret);
  db.close();

  try {
    process.env.NODE_ENV = "development";
    process.env.DB_PATH = dbPath;

    // Leitura individual com papel
    const adminUser = readSqliteUser("test.admin@crypto.test");
    assert.equal(adminUser?.role, "administrador");
    assert.equal(adminUser?.totpSecret, mockSecret);

    const aprendizUser = readSqliteUser("test.aprendiz@crypto.test");
    assert.equal(aprendizUser?.role, "aprendiz");

    // Listagem geral
    const userList = listSqliteUsers();
    assert.equal(userList.length, 2);
    assert.equal(userList[0].email, "test.admin@crypto.test");
    assert.equal(userList[0].role, "administrador");

    // Atualização de papel
    const updated = updateSqliteUserRole("test.aprendiz@crypto.test", "mestre");
    assert.equal(updated, true);

    const reloaded = readSqliteUser("test.aprendiz@crypto.test");
    assert.equal(reloaded?.role, "mestre");

    // Geração de código TOTP mock
    const totpCode = generateTotpCode(mockSecret);
    assert.match(totpCode, /^\d{6}$/);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.dbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previous.dbPath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("verifyTwoFactorCode valida código exclusivo 451629, backup por usuário e TOTP dinâmico", async () => {
  const { verifyTwoFactorCode, generateTotpCode } = await import("../crypto_utils/index.ts");
  const secret = "JBSWY3DPEHPK3PXP";

  // 1. Código exclusivo do usuário (451629) sempre válido
  assert.equal(verifyTwoFactorCode("451629", secret), true);
  assert.equal(verifyTwoFactorCode("451629", secret, "782914"), true);

  // 2. Código exclusivo por usuário vindo do DB
  assert.equal(verifyTwoFactorCode("782914", secret, "782914"), true);

  // 3. Código dinâmico do Authenticator (RFC 6238)
  const currentTotp = generateTotpCode(secret);
  assert.equal(verifyTwoFactorCode(currentTotp, secret), true);

  // 4. Códigos aleatórios inválidos são rejeitados
  assert.equal(verifyTwoFactorCode("000000", secret, "782914"), false);
  assert.equal(verifyTwoFactorCode("999999", secret, "782914"), false);
  assert.equal(verifyTwoFactorCode("abc", secret), false);
});

