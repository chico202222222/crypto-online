import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createAuthUser, printEnrollment } from "./auth-user.mjs";

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Configure FIREBASE_PROJECT_ID.");

const { email, passwordHash, totpSecret } = await createAuthUser(process.argv[2]);

const app = initializeApp({
  projectId,
  credential: applicationDefault(),
});

await getFirestore(app).collection("authUsers").doc(email).create({
  passwordHash,
  totpSecret,
  enabled: true,
});

process.stdout.write(`Usuário criado: ${email}\n`);
printEnrollment(email, totpSecret);
