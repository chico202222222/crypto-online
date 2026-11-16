import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/crypto_utils";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api",
  "/api/coins",
  "/api/plot",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const token = request.cookies.get("crypto_session")?.value;
  const authenticated = token ? (await verifySessionToken(token)).valid : false;

  if (pathname === "/login") {
    return authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (authenticated) return NextResponse.next();

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.json(
      { status: "error", message: "Não autenticado." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
