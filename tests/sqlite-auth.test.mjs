import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { isSqliteAuthConfigured, readSqliteUser } from "../crypto_utils/sqlite-auth.ts";

test("resolve o caminho configurado e lê somente usuários habilitados", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "crypto-sqlite-test-"));
  const dbPath = path.join(directory, "users.db");
  const previous = { nodeEnv: process.env.NODE_ENV, dbPath: process.env.DB_PATH };
  const database = new DatabaseSync(dbPath);
  database.exec("CREATE TABLE users (email TEXT, password TEXT, two_factor_secret TEXT, two_factor_enabled INTEGER)");
  database.prepare("INSERT INTO users VALUES (?, ?, ?, ?)").run("valid@example.test", `${"a".repeat(32)}:${"b".repeat(64)}`, "JBSWY3DPEHPK3PXP", 1);
  database.prepare("INSERT INTO users VALUES (?, ?, ?, ?)").run("disabled@example.test", `${"a".repeat(32)}:${"b".repeat(64)}`, "JBSWY3DPEHPK3PXP", 0);
  database.close();

  try {
    process.env.NODE_ENV = "development";
    process.env.DB_PATH = dbPath;
    assert.equal(isSqliteAuthConfigured(), true);
    assert.equal(readSqliteUser("valid@example.test")?.totpSecret, "JBSWY3DPEHPK3PXP");
    assert.equal(readSqliteUser("disabled@example.test"), null);
    process.env.DB_PATH = path.join(directory, "missing.db");
    assert.equal(isSqliteAuthConfigured(), false);
    process.env.NODE_ENV = "production";
    process.env.DB_PATH = dbPath;
    assert.equal(isSqliteAuthConfigured(), false);
    assert.equal(readSqliteUser("valid@example.test"), null);
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.dbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previous.dbPath;
    rmSync(directory, { recursive: true, force: true });
  }
});
