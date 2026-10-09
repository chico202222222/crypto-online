import { NextResponse } from "next/server";
import { isOriginAllowed } from "@/crypto_utils";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const isAllowed = isOriginAllowed(origin, request);
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": isAllowed && origin ? origin : "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin, request)) {
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
