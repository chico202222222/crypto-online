import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/crypto_utils";

const ALLOWED_PATHS = new Set(["/", "/health", "/api/value", "/api/btc"]);

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mercury_session")?.value || cookieStore.get("crypto_session")?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session?.valid || !session.email) {
    return NextResponse.json({ status: "error", message: "Não autenticado." }, { status: 401 });
  }

  const rawPath = new URL(request.url).searchParams.get("path") || "/health";
  let target: URL;
  try {
    target = new URL(rawPath, "http://127.0.0.1");
  } catch {
    return NextResponse.json({ status: "error", message: "Rota inválida." }, { status: 400 });
  }
  if (target.origin !== "http://127.0.0.1" || !ALLOWED_PATHS.has(target.pathname)) {
    return NextResponse.json({ status: "error", message: "Rota não permitida." }, { status: 400 });
  }

  const base = process.env.RUST_API_URL || process.env.CROW_API_URL || process.env.CROW_URL || "http://127.0.0.1:18080";
  try {
    const response = await fetch(`${base}${target.pathname}${target.search}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ status: "error", message: "Microserviço Rust inacessível." }, { status: 503 });
  }
}
