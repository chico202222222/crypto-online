#!/usr/bin/env node
/**
 * Script para popular / migrar usuários e permissões para o Cloud Firestore (Firebase)
 * Uso:
 *   node scripts/seed_firestore.mjs
 */

import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "node:crypto";

const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!projectId || !serviceAccountRaw) {
  console.error("❌ ERRO: Defina FIREBASE_PROJECT_ID e FIREBASE_SERVICE_ACCOUNT_JSON para conectar ao Firestore.");
  console.log("\nExemplo em .env:");
  console.log("FIREBASE_PROJECT_ID=seu-projeto-firebase");
  console.log("FIREBASE_SERVICE_ACCOUNT_JSON='{\"project_id\":\"...\",\"client_email\":\"...\",\"private_key\":\"...\"}'\n");
  process.exit(1);
}

const credentials = JSON.parse(serviceAccountRaw);
const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId,
      credential: cert({
        projectId,
        clientEmail: credentials.client_email,
        privateKey: credentials.private_key,
      }),
    });

const db = getFirestore(app);

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function generateTotpSecret() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const random = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let secret = "";
  for (const byte of random) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      secret += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return secret;
}

const DEFAULT_SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD;
if (!DEFAULT_SEED_PASSWORD || DEFAULT_SEED_PASSWORD.length < 12) {
  console.error("❌ ERRO: Defina SEED_DEFAULT_PASSWORD (mínimo de 12 caracteres) no ambiente antes de popular o Firestore.");
  process.exit(1);
}

const USERS_TO_SEED = [
  {
    email: "admin@exemplo.com",
    role: "administrador",
  },
  {
    email: "mestre@exemplo.com",
    role: "mestre",
  },
  {
    email: "aprendiz@exemplo.com",
    role: "aprendiz",
  },
];

async function seed() {
  console.log("================================================================================");
  console.log("   POPULANDO USUÁRIOS E PERMISSÕES NO CLOUD FIRESTORE (FIREBASE)");
  console.log(`   Projeto: ${projectId}`);
  console.log("================================================================================\n");

  for (const user of USERS_TO_SEED) {
    const totpSecret = generateTotpSecret();
    const docRef = db.collection("authUsers").doc(user.email.toLowerCase());
    const docData = {
      email: user.email.toLowerCase(),
      role: user.role, // 'administrador' | 'mestre' | 'aprendiz'
      passwordHash: hashPassword(DEFAULT_SEED_PASSWORD),
      totpSecret,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    await docRef.set(docData, { merge: true });
    console.log(`✓ Gravado: ${user.email} -> Permissão: [${user.role}] | TOTP Secret: ${totpSecret}`);
  }

  console.log("\n================================================================================");
  console.log("✓ Todos os usuários foram gravados com sucesso na coleção 'authUsers' do Firestore!");
  console.log("================================================================================\n");
}

seed().catch((err) => {
  console.error("Falha ao gravar no Firestore:", err);
  process.exit(1);
});
