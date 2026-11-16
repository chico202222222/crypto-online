import { NextResponse } from "next/server";
import { generateTotpCode } from "@/crypto_utils";
import { listSqliteUsers, readSqliteUser } from "@/crypto_utils/sqlite-auth";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { status: "error", message: "Recurso indisponível em ambiente de produção." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const url = new URL(request.url);
  const specificEmail = url.searchParams.get("email")?.toLowerCase().trim();

  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = 30 - (now % 30);

  if (specificEmail) {
    const user = readSqliteUser(specificEmail);
    if (!user) {
      return NextResponse.json(
        { status: "error", message: "Usuário não encontrado." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    const code = generateTotpCode(user.totpSecret, now);
    return NextResponse.json(
      {
        status: "success",
        user: {
          email: specificEmail,
          role: user.role,
          totpCode: code,
          secondsRemaining,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  const users = listSqliteUsers().filter((u) => u.twoFactorEnabled);
  const accounts = users.map((u) => {
    const fullUser = readSqliteUser(u.email);
    const code = fullUser ? generateTotpCode(fullUser.totpSecret, now) : "------";
    return {
      email: u.email,
      role: u.role,
      totpCode: code,
    };
  });

  return NextResponse.json(
    {
      status: "success",
      mockAuthenticator: {
        active: true,
        secondsRemaining,
        accounts,
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
