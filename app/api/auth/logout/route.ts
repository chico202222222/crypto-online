import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json(
      { status: "error", message: "Origem não permitida." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json(
    { status: "success", message: "Sessão encerrada com sucesso." },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );

  // Remove o cookie definindo maxAge = 0
  response.cookies.set({
    name: "crypto_session",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
