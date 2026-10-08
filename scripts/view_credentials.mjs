#!/usr/bin/env node
/**
 * Utilitário de Visualização e Redefinição de Credenciais de Desenvolvimento
 *
 * NOTA DE SEGURANÇA:
 * Hashes criptográficos (PBKDF2 / scrypt) são funções matemáticas UNIDIRECIONAIS (one-way).
 * Não é matematicamente possível "reverter" um hash para a senha original.
 * Este script consulta o banco e exibe as senhas conhecidas de teste associadas aos usuários
 * e permite redefinir a senha de qualquer usuário para uma nova senha em texto plano.
 *
 * Uso:
 *   node scripts/view_credentials.mjs
 *   node scripts/view_credentials.mjs --set usuario@exemplo.com NovaSenha123
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, "../cryptoRequestSchema/db/users.db");

// Senhas padrão de desenvolvimento
const KNOWN_DEV_PASSWORDS = {
  "admin@cryptoonline.pro": "Admin@123456",
  "fran82652@gmail.com": "Admin@123456",
  "mestre@cryptoonline.pro": "Mestre@123456",
  "trader@cryptoonline.pro": "Trader@123456",
  "aprendiz@cryptoonline.pro": "Aprendiz@123456",
};

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of input.toUpperCase()) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) continue;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function generateTotp(secret) {
  const counter = Math.floor(Math.floor(Date.now() / 1000) / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

function hashPasswordPbkdf2(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.pbkdf2Sync(password, Buffer.from(salt, "hex"), 100_000, 32, "sha256");
  return `${salt}:${derived.toString("hex")}`;
}

export function listCredentials() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const users = db.prepare("SELECT id, email, role, password, two_factor_secret, two_factor_enabled FROM users").all();
  db.close();

  console.log("\n================================================================================");
  console.log("   CREDENCIAIS DE DESENVOLVIMENTO (CryptoOnline)");
  console.log("   Banco de Dados: " + DB_PATH);
  console.log("================================================================================\n");

  console.log(
    String("ID").padEnd(4) +
    String("EMAIL").padEnd(30) +
    String("PERMISSÃO").padEnd(16) +
    String("SENHA (DEV)").padEnd(18) +
    String("CÓDIGO 2FA").padEnd(12) +
    "SEGREDO TOTP"
  );
  console.log("-".repeat(95));

  for (const u of users) {
    const emailNorm = String(u.email).toLowerCase();
    const devPass = KNOWN_DEV_PASSWORDS[emailNorm] || "(Senha Customizada)";
    const totp = u.two_factor_secret ? generateTotp(u.two_factor_secret) : "N/A";

    console.log(
      String(u.id).padEnd(4) +
      String(u.email).padEnd(30) +
      String(u.role || "aprendiz").padEnd(16) +
      String(devPass).padEnd(18) +
      String(totp).padEnd(12) +
      String(u.two_factor_secret || "N/A")
    );
  }

  console.log("\n" + "=".repeat(95));
  console.log("💡 Para redefinir a senha de um usuário:");
  console.log("   node scripts/view_credentials.mjs --set <email> <novaSenha>\n");
}

export function setUserPassword(email, newPlainPassword) {
  if (!email || !newPlainPassword || newPlainPassword.length < 8) {
    console.error("❌ ERRO: A senha deve ter no mínimo 8 caracteres.");
    return false;
  }

  const db = new DatabaseSync(DB_PATH);
  const normalizedEmail = email.trim().toLowerCase();
  const hash = hashPasswordPbkdf2(newPlainPassword);

  const res = db.prepare("UPDATE users SET password = ? WHERE email = ?").run(hash, normalizedEmail);
  db.close();

  if (res.changes > 0) {
    console.log(`\n✓ Senha do usuário '${normalizedEmail}' atualizada com sucesso para: '${newPlainPassword}'`);
    console.log(`✓ Hash gerado no SQLite: ${hash}\n`);
    return true;
  } else {
    console.error(`❌ Usuário '${normalizedEmail}' não encontrado no banco de dados.`);
    return false;
  }
}

// Execução CLI
if (process.argv[2] === "--set") {
  setUserPassword(process.argv[3], process.argv[4]);
} else if (process.argv[1] && process.argv[1].endsWith("view_credentials.mjs")) {
  listCredentials();
}
