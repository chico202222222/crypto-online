import crypto from "node:crypto";

export async function createAuthUser(emailInput) {
  const email = emailInput?.trim().toLowerCase();
  if (!email || !/^[^\s/@]+@[^\s/@]+$/.test(email)) {
    throw new Error("Informe o e-mail como primeiro argumento.");
  }

  let password = "";
  for await (const chunk of process.stdin) {
    password += chunk;
    if (password.length > 1024) throw new Error("Senha muito longa.");
  }
  if (password.length < 12) throw new Error("Use uma senha com pelo menos 12 caracteres.");

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const random = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let totpSecret = "";
  for (const byte of random) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      totpSecret += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
  password = "";
  return { email, passwordHash, totpSecret };
}

export function printEnrollment(email, totpSecret) {
  const label = encodeURIComponent(`Mercury:${email}`);
  const issuer = encodeURIComponent("Mercury");
  process.stdout.write(`Segredo do autenticador: ${totpSecret}\n`);
  process.stdout.write(`URI do autenticador: otpauth://totp/${label}?secret=${totpSecret}&issuer=${issuer}\n`);
}
