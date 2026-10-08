import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

interface ServiceAccountJson {
  project_id?: unknown;
  client_email?: unknown;
  private_key?: unknown;
}

function firebaseApp() {
  const existing = getApps().find((app) => app.name === "crypto-online-auth");
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!projectId || !raw) throw new Error("Firebase não configurado.");

  const credentials = JSON.parse(raw) as ServiceAccountJson;
  if (
    credentials.project_id !== projectId ||
    typeof credentials.client_email !== "string" ||
    typeof credentials.private_key !== "string"
  ) {
    throw new Error("Credenciais Firebase inválidas.");
  }

  return initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key,
    }),
  }, "crypto-online-auth");
}

import { normalizeRole, type UserRole, type SqliteUserDetail } from "./sqlite-auth.ts";

export async function getFirebaseUser(
  email: string
): Promise<{ passwordHash: string; totpSecret: string; role: UserRole } | null> {
  const snapshot = await getFirestore(firebaseApp()).collection("authUsers").doc(email).get();
  if (!snapshot.exists) return null;

  const user = snapshot.data();
  if (!user || user.enabled !== true) return null;
  if (
    typeof user.passwordHash !== "string" ||
    !/^[a-f0-9]{32}:(?:[a-f0-9]{128}|[a-f0-9]{64})$/i.test(user.passwordHash)
  )
    return null;
  if (typeof user.totpSecret !== "string" || !/^[A-Z2-7]{16,}$/i.test(user.totpSecret)) return null;

  const role = normalizeRole(user.role);
  return { passwordHash: user.passwordHash, totpSecret: user.totpSecret, role };
}

export async function listFirebaseUsers(): Promise<SqliteUserDetail[]> {
  const snapshot = await getFirestore(firebaseApp()).collection("authUsers").get();
  let id = 1;
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: id++,
      email: doc.id,
      role: normalizeRole(data.role),
      twoFactorEnabled: data.enabled === true,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : "Firestore",
    };
  });
}

export async function updateFirebaseUserRole(email: string, newRole: UserRole): Promise<boolean> {
  const db = getFirestore(firebaseApp());
  const ref = db.collection("authUsers").doc(email.trim().toLowerCase());
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.update({ role: normalizeRole(newRole) });
  return true;
}
