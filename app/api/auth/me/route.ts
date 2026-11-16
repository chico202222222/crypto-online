import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/crypto_utils";

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("crypto_session")?.value;

  if (!sessionToken) {
    return NextResponse.json(
      { status: "error", message: "Não autenticado." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const verified = await verifySessionToken(sessionToken);
  if (!verified.valid || !verified.email) {
    return NextResponse.json(
      { status: "error", message: "Sessão inválida ou expirada." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      status: "success",
      user: {
        email: verified.email,
        role: verified.role ?? "aprendiz",
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
