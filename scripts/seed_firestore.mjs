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

const USERS_TO_SEED = [
  {
    email: "admin@cryptoonline.pro",
    role: "administrador",
    password: "Admin@123456",
    totpSecret: "JBSWY3DPEHPK3PXP",
  },
  {
    email: "fran82652@gmail.com",
    role: "administrador",
    password: "Admin@123456",
    totpSecret: "JBSWY3DPEHPK3PXP",
  },
  {
    email: "mestre@cryptoonline.pro",
    role: "mestre",
    password: "Mestre@123456",
    totpSecret: "JBSWY3DPEHPK3PXP",
  },
  {
    email: "trader@cryptoonline.pro",
    role: "mestre",
    password: "Trader@123456",
    totpSecret: "JBSWY3DPEHPK3PXP",
  },
  {
    email: "aprendiz@cryptoonline.pro",
    role: "aprendiz",
    password: "Aprendiz@123456",
    totpSecret: "JBSWY3DPEHPK3PXP",
  },
];

async function seed() {
  console.log("================================================================================");
  console.log("   POPULANDO USUÁRIOS E PERMISSÕES NO CLOUD FIRESTORE (FIREBASE)");
  console.log(`   Projeto: ${projectId}`);
  console.log("================================================================================\n");

  for (const user of USERS_TO_SEED) {
    const docRef = db.collection("authUsers").doc(user.email.toLowerCase());
    const docData = {
      email: user.email.toLowerCase(),
      role: user.role, // 'administrador' | 'mestre' | 'aprendiz'
      passwordHash: hashPassword(user.password),
      totpSecret: user.totpSecret,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    await docRef.set(docData, { merge: true });
    console.log(`✓ Gravado: ${user.email} -> Permissão: [${user.role}]`);
  }

  console.log("\n================================================================================");
  console.log("✓ Todos os usuários foram gravados com sucesso na coleção 'authUsers' do Firestore!");
  console.log("================================================================================\n");
}

seed().catch((err) => {
  console.error("Falha ao gravar no Firestore:", err);
  process.exit(1);
});
