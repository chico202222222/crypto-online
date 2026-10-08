#!/usr/bin/env node
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, "../cryptoRequestSchema/db/users.db");

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of input.toUpperCase()) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Caractere inválido em base32: " + char);
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpCode(secretBase32, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const counter = Math.floor(timestampSeconds / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secretBase32)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

function runCLI() {
  const emailFilter = process.argv[2]?.toLowerCase().trim();
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = 30 - (now % 30);

  console.log("\n================================================================================");
  console.log("   MOCK AUTHENTICATOR (TOTP RFC 6238) - CryptoOnline");
  console.log("   Tempo restante da janela TOTP: " + secondsRemaining + "s");
  console.log("================================================================================\n");

  try {
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    const users = db.prepare(
      "SELECT email, role, two_factor_secret, two_factor_enabled FROM users WHERE two_factor_enabled = 1"
    ).all();
    db.close();

    const filtered = emailFilter ? users.filter(u => u.email.toLowerCase().includes(emailFilter)) : users;

    if (filtered.length === 0) {
      console.log("Nenhum usuário encontrado com 2FA habilitado.");
      return;
    }

    console.log(String("EMAIL").padEnd(32) + String("PERMISSÃO").padEnd(16) + String("CÓDIGO 2FA").padEnd(14) + "SEGREDO");
    console.log("-".repeat(80));

    for (const u of filtered) {
      try {
        const code = generateTotpCode(u.two_factor_secret, now);
        console.log(
          String(u.email).padEnd(32) +
          String(u.role || "aprendiz").padEnd(16) +
          String("🔑 " + code).padEnd(14) +
          String(u.two_factor_secret)
        );
      } catch (err) {
        console.log(String(u.email).padEnd(32) + "ERRO: " + err.message);
      }
    }

    console.log("\n" + "=".repeat(80) + "\n");
  } catch (err) {
    console.error("Erro ao acessar banco de dados SQLite:", err.message);
  }
}

if (process.argv[1] && process.argv[1].endsWith("mock_authenticator.mjs")) {
  runCLI();
}
