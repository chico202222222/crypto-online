import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type UserRole = "administrador" | "mestre" | "aprendiz";

export interface SqliteUser {
  passwordHash: string;
  totpSecret: string;
  role: UserRole;
  backupCode?: string;
}

export interface SqliteUserDetail {
  id: number;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export function normalizeRole(rawRole: unknown): UserRole {
  if (typeof rawRole !== "string") return "aprendiz";
  const r = rawRole.toLowerCase().trim();
  if (r === "administrador" || r === "admin") return "administrador";
  if (r === "mestre" || r === "trader") return "mestre";
  if (r === "aprendiz" || r === "user") return "aprendiz";
  return "aprendiz";
}

function configuredPath(): string | null {
  if (process.env.NODE_ENV === "production" && process.env.AUTH_STORE !== "sqlite") return null;
  const value = process.env.DB_PATH || process.env.DEVELOPMENT_DB || process.env.DB;
  return value ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), value) : null;
}

export function isSqliteAuthConfigured(): boolean {
  const dbPath = configuredPath();
  if (!dbPath) return false;
  try {
    const database = new DatabaseSync(dbPath, { readOnly: true });
    try {
      return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get());
    } finally {
      database.close();
    }
  } catch {
    return false;
  }
}

export function readSqliteUser(email: string): SqliteUser | null {
  const dbPath = configuredPath();
  if (!dbPath) return null;
  try {
    const database = new DatabaseSync(dbPath, { readOnly: true });
    try {
      let row: Record<string, unknown> | undefined;
      let hasRoleColumn = true;
      try {
        row = database.prepare(
          "SELECT password, two_factor_secret, two_factor_enabled, role, two_factor_backup_code FROM users WHERE email = ? LIMIT 1"
        ).get(email) as Record<string, unknown> | undefined;
      } catch {
        hasRoleColumn = false;
        row = database.prepare(
          "SELECT password, two_factor_secret, two_factor_enabled FROM users WHERE email = ? LIMIT 1"
        ).get(email) as Record<string, unknown> | undefined;
      }

      if (!row || row.two_factor_enabled !== 1) return null;
      if (typeof row.password !== "string" || !/^[a-f0-9]{32}:(?:[a-f0-9]{128}|[a-f0-9]{64})$/i.test(row.password)) return null;
      if (typeof row.two_factor_secret !== "string" || !/^[a-z2-7]{16,}$/i.test(row.two_factor_secret)) return null;
      const role = hasRoleColumn ? normalizeRole(row.role) : "aprendiz";
      const backupCode = typeof row.two_factor_backup_code === "string" ? String(row.two_factor_backup_code) : undefined;
      return { passwordHash: row.password, totpSecret: row.two_factor_secret.toUpperCase(), role, backupCode };
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
}

export function listSqliteUsers(): SqliteUserDetail[] {
  const dbPath = configuredPath();
  if (!dbPath) return [];
  try {
    const database = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = database.prepare(
        "SELECT id, email, role, two_factor_enabled, created_at FROM users ORDER BY id ASC"
      ).all() as Array<Record<string, unknown>>;
      return rows.map((r) => ({
        id: Number(r.id),
        email: String(r.email),
        role: normalizeRole(r.role),
        twoFactorEnabled: Number(r.two_factor_enabled) === 1,
        createdAt: String(r.created_at || ""),
      }));
    } finally {
      database.close();
    }
  } catch {
    return [];
  }
}

export function updateSqliteUserRole(email: string, newRole: UserRole): boolean {
  const dbPath = configuredPath();
  if (!dbPath) return false;
  try {
    const database = new DatabaseSync(dbPath);
    try {
      const normalized = normalizeRole(newRole);
      const res = database.prepare("UPDATE users SET role = ? WHERE email = ?").run(normalized, email.trim().toLowerCase());
      return res.changes > 0;
    } finally {
      database.close();
    }
  } catch {
    return false;
  }
}

export function updateSqliteUserPassword(email: string, newPasswordHash: string): boolean {
  const dbPath = configuredPath();
  if (!dbPath) return false;
  try {
    const database = new DatabaseSync(dbPath);
    try {
      const res = database.prepare("UPDATE users SET password = ? WHERE email = ?").run(newPasswordHash, email.trim().toLowerCase());
      return res.changes > 0;
    } finally {
      database.close();
    }
  } catch {
    return false;
  }
}
