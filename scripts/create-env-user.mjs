import { createAuthUser, printEnrollment } from "./auth-user.mjs";

const { email, passwordHash, totpSecret } = await createAuthUser(process.argv[2]);
process.stdout.write(`AUTH_USERS_JSON=${JSON.stringify({ [email]: { passwordHash, totpSecret } })}\n`);
printEnrollment(email, totpSecret);
