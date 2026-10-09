import crypto from "node:crypto";
import { isSqliteAuthConfigured, readSqliteUser, listSqliteUsers, updateSqliteUserRole, updateSqliteUserPassword, type UserRole, normalizeRole } from "./sqlite-auth.ts";
import { isOriginAllowed, getAllowedOrigins, parseConfiguredOrigins, isLocalhostOrigin } from "./origin.ts";

export type { UserRole };
export { listSqliteUsers, updateSqliteUserRole, updateSqliteUserPassword };
export { isOriginAllowed, getAllowedOrigins, parseConfiguredOrigins, isLocalhostOrigin };

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  administrador: 3,
  mestre: 2,
  aprendiz: 1,
};

export function hasMinPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

export async function listAllUsers() {
  if (process.env.AUTH_STORE === "firebase") {
    const { listFirebaseUsers } = await import("./firebase-auth.ts");
    return listFirebaseUsers();
  }
  return listSqliteUsers();
}

export async function updateUserRoleInStore(email: string, role: UserRole): Promise<boolean> {
  if (process.env.AUTH_STORE === "firebase") {
    const { updateFirebaseUserRole } = await import("./firebase-auth.ts");
    return updateFirebaseUserRole(email, role);
  }
  return updateSqliteUserRole(email, role);
}

export function updateUserPasswordInStore(email: string, newPlainPassword: string): boolean {
  const hash = hashPassword(newPlainPassword);
  return updateSqliteUserPassword(email, hash);
}

export type AuthUser = {
  passwordHash: string;
  totpSecret: string;
  role?: UserRole;
  backupCode?: string;
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres.");
  }
  return secret;
}

export function isAuthConfigured(): boolean {
  try {
    sessionSecret();
    if (process.env.AUTH_STORE === "firebase") {
      return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }
    if (process.env.AUTH_STORE === "env") return Boolean(process.env.AUTH_USERS_JSON);
    if (process.env.AUTH_STORE === "sqlite") return isSqliteAuthConfigured();
    if (process.env.AUTH_STORE) return false;
    return Boolean(process.env.AUTH_USERS_JSON) || isSqliteAuthConfigured();
  } catch {
    return false;
  }
}

export async function getConfiguredUser(email: string): Promise<AuthUser | null> {
  const normalized = email.trim().toLowerCase();
  const allowedUsers = process.env.ALLOWED_USERS;
  if (allowedUsers && !allowedUsers.split(",").some((item) => item.trim().toLowerCase() === normalized)) {
    return null;
  }

  if (process.env.AUTH_STORE === "firebase") {
    const { getFirebaseUser } = await import("./firebase-auth");
    const fbUser = await getFirebaseUser(normalized);
    return fbUser ? { ...fbUser, role: normalizeRole(fbUser.role) } : null;
  }

  if (process.env.AUTH_STORE === "sqlite") return readSqliteUser(normalized);
  if (process.env.AUTH_STORE && process.env.AUTH_STORE !== "env") return null;
  if (!process.env.AUTH_USERS_JSON) {
    return process.env.AUTH_STORE === "env" ? null : readSqliteUser(normalized);
  }

  try {
    const users: unknown = JSON.parse(process.env.AUTH_USERS_JSON || "{}");
    if (!users || typeof users !== "object" || Array.isArray(users)) return null;
    const user = (users as Record<string, unknown>)[normalized];
    if (!user || typeof user !== "object" || Array.isArray(user)) return null;
    const { passwordHash, totpSecret, role, backupCode } = user as Record<string, unknown>;
    if (typeof passwordHash !== "string" || typeof totpSecret !== "string") return null;
    if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(passwordHash)) return null;
    if (!/^[A-Z2-7]{16,}$/i.test(totpSecret)) return null;
    return {
      passwordHash,
      totpSecret,
      role: normalizeRole(role),
      backupCode: typeof backupCode === "string" ? backupCode : undefined,
    };
  } catch {
    return null;
  }
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of input.toUpperCase()) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Segredo TOTP inválido.");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpCode(secretBase32: string, timestampSeconds = Math.floor(Date.now() / 1000)): string {
  const counter = Math.floor(timestampSeconds / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secretBase32)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

export function verifyTwoFactorCode(code: string, secretBase32: string, backupCode?: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  // 1. Código exclusivo do usuário configurado no banco de dados
  if (backupCode && code === backupCode) {
    return true;
  }

  // 2. Código gerado em tempo real pelo aplicativo Authenticator (RFC 6238 TOTP)
  const now = Math.floor(Date.now() / 1000);
  try {
    const valid = [-30, 0, 30].some((offset) =>
      crypto.timingSafeEqual(Buffer.from(code), Buffer.from(generateTotpCode(secretBase32, now + offset)))
    );
    if (valid) return true;
    return false;
  } catch {
    return false;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function comparePassword(password: string, storedHash: string): boolean {
  if (!password) return false;

  if (!storedHash || !/^[a-f0-9]{32}:(?:[a-f0-9]{128}|[a-f0-9]{64})$/i.test(storedHash)) return false;
  const [salt, hash] = storedHash.split(":");
  try {
    const derived = hash.length === 128
      ? crypto.scryptSync(password, salt, 64)
      : crypto.pbkdf2Sync(password, Buffer.from(salt, "hex"), 100_000, 32, "sha256");
    if (crypto.timingSafeEqual(derived, Buffer.from(hash, "hex"))) {
      return true;
    }
  } catch {
    // fallback
  }
  return false;
}

export function generateSessionToken(email: string, maxAgeSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ email: email.trim().toLowerCase(), iat: now, exp: now + maxAgeSeconds })).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<{ valid: boolean; email?: string; role?: UserRole }> {
  if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return { valid: false };
  try {
    const [payloadB64, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", sessionSecret()).update(payloadB64).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return { valid: false };
    const payload: unknown = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object") return { valid: false };
    const { email, iat, exp } = payload as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof email !== "string" || typeof iat !== "number" || typeof exp !== "number") return { valid: false };
    if (iat > now || exp <= now || exp - iat > 7 * 24 * 60 * 60) return { valid: false };
    const user = await getConfiguredUser(email);
    if (!user) return { valid: false };
    return { valid: true, email, role: user.role ?? "aprendiz" };
  } catch {
    return { valid: false };
  }
}
