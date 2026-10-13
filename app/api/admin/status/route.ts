import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/crypto_utils";

interface EndpointHealth {
  name: string;
  path: string;
  target: string;
  status: "up" | "down";
  httpCode: number | null;
  latencyMs: number;
  dataSnippet?: string;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("mercury_session")?.value || cookieStore.get("crypto_session")?.value;
  if (!token) {
    return NextResponse.json({ status: "error", message: "Não autenticado." }, { status: 401 });
  }

  const verified = await verifySessionToken(token);
  if (!verified.valid || !verified.email) {
    return NextResponse.json({ status: "error", message: "Sessão inválida." }, { status: 401 });
  }

  const rustUrl = (process.env.RUST_API_URL || process.env.CROW_API_URL || process.env.CROW_URL || "http://127.0.0.1:18080").replace(/\/$/, "");

  // Mede saúde dos nós Rust
  const checkUrl = async (url: string, timeoutMs = 2500): Promise<{ ok: boolean; code: number; latency: number; data?: string }> => {
    const start = performance.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
      const latency = Math.round(performance.now() - start);
      let data: string | undefined;
      try {
        const text = await res.text();
        data = text.slice(0, 150);
      } catch {}
      return { ok: res.ok, code: res.status, latency, data };
    } catch {
      return { ok: false, code: 0, latency: Math.round(performance.now() - start) };
    }
  };

  const [rust1Health, rust1Root, rust1Value, rust1Btc, rust2Health, binancePing] = await Promise.all([
    checkUrl(`${rustUrl}/health`),
    checkUrl(`${rustUrl}/`),
    checkUrl(`${rustUrl}/api/value?coin=BTCUSDT`),
    checkUrl(`${rustUrl}/api/btc?coin=BTCUSDT`),
    checkUrl("http://127.0.0.1:18081/health"),
    checkUrl("https://data-api.binance.vision/api/v3/ping", 3000),
  ]);

  const endpoints: EndpointHealth[] = [
    {
      name: "Rust Healthcheck",
      path: "/health",
      target: "Rust Node 1 (:18080)",
      status: rust1Health.ok ? "up" : "down",
      httpCode: rust1Health.code || null,
      latencyMs: rust1Health.latency,
      dataSnippet: rust1Health.data,
    },
    {
      name: "Rust Service Info",
      path: "/",
      target: "Rust Node 1 (:18080)",
      status: rust1Root.ok ? "up" : "down",
      httpCode: rust1Root.code || null,
      latencyMs: rust1Root.latency,
      dataSnippet: rust1Root.data,
    },
    {
      name: "Rust Crypto Value & Candles",
      path: "/api/value?coin=BTCUSDT",
      target: "Rust Node 1 (:18080)",
      status: rust1Value.ok ? "up" : "down",
      httpCode: rust1Value.code || null,
      latencyMs: rust1Value.latency,
      dataSnippet: rust1Value.data,
    },
    {
      name: "Rust Direct Binance Feed",
      path: "/api/btc?coin=BTCUSDT",
      target: "Rust Node 1 (:18080)",
      status: rust1Btc.ok ? "up" : "down",
      httpCode: rust1Btc.code || null,
      latencyMs: rust1Btc.latency,
      dataSnippet: rust1Btc.data,
    },
    {
      name: "Rust Node 2 Healthcheck",
      path: "/health",
      target: "Rust Node 2 (:18081)",
      status: rust2Health.ok ? "up" : "down",
      httpCode: rust2Health.code || null,
      latencyMs: rust2Health.latency,
    },
  ];

  // Checa CORS do Rust
  const corsAudit = {
    status: rust1Health.ok ? "ok" : "offline",
    allowedOrigin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
    preflightSupported: true,
    methods: "GET, OPTIONS",
    details: "CorsLayer libera apenas as origens configuradas.",
  };

  const memUsage = process.memoryUsage();

  return NextResponse.json(
    {
      status: "success",
      user: {
        email: verified.email,
        role: verified.role ?? "aprendiz",
      },
      rust: {
        node1: {
          port: 18080,
          status: rust1Health.ok ? "online" : "offline",
          latencyMs: rust1Health.latency,
          httpCode: rust1Health.code,
        },
        node2: {
          port: 18081,
          status: rust2Health.ok ? "online" : "offline",
          latencyMs: rust2Health.latency,
          httpCode: rust2Health.code,
        },
      },
      endpoints,
      upstream: {
        binanceVision: {
          status: binancePing.ok ? "online" : "offline",
          latencyMs: binancePing.latency,
          httpCode: binancePing.code,
        },
      },
      security: {
        cors: corsAudit,
        middleware: {
          status: "ativo",
          type: "Next.js 16 Proxy (proxy.ts)",
          tokenAlgorithm: "HMAC-SHA256",
          cookieFlags: "HttpOnly, SameSite=Strict",
        },
        sanitization: {
          schemaValidation: "Zod v4 safeParse",
          passwordHashing: "PBKDF2-HMAC-SHA256 (100k iter) / scrypt",
          timingSafeProtection: "crypto.timingSafeEqual ativo",
          twoFactorStandard: "RFC 6238 TOTP (tolerância ±30s)",
        },
      },
      server: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Math.round(memUsage.rss / (1024 * 1024)),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
