import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCoin = searchParams.get("coin") || "BTCUSDT";
  let coin = rawCoin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTCUSDT";
  if (
    coin.length <= 6 &&
    !coin.endsWith("USDT") &&
    !coin.endsWith("BTC") &&
    !coin.endsWith("USDC") &&
    !coin.endsWith("FDUSD")
  ) {
    coin = `${coin}USDT`;
  }
  const interval = searchParams.get("interval") || "1h";

  const RUST_URL = process.env.RUST_API_URL || process.env.CROW_API_URL || process.env.CROW_URL || "http://127.0.0.1:18080";

  try {
    const res = await fetch(`${RUST_URL}/api/plot?coin=${encodeURIComponent(coin)}&interval=${encodeURIComponent(interval)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const imageBuffer = await res.arrayBuffer();
      const dataSource = res.headers.get("x-data-source") || "unknown";
      return new NextResponse(imageBuffer, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": dataSource === "simulated" ? "no-store" : "public, max-age=15, stale-while-revalidate=30",
          "X-Backend-Source": "mercury-rust-plotters",
          "X-Data-Source": dataSource,
        },
      });
    }
  } catch {}

  // Fallback SVG elegante caso o serviço Rust esteja offline, mantendo a experiência fluida no frontend
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
    <rect width="800" height="400" fill="#0c141e"/>
    <rect x="20" y="20" width="760" height="360" rx="12" fill="#101923" stroke="#253545" stroke-width="1.5"/>
    <text x="40" y="60" fill="#e2ecf5" font-family="monospace" font-size="16" font-weight="bold">MERCURY · ${coin}</text>
    <rect x="620" y="44" width="140" height="24" rx="4" fill="#352317" stroke="#78471e"/>
    <text x="690" y="60" fill="#e8a86b" font-family="monospace" font-size="10" text-anchor="middle" font-weight="bold">RUST OFFLINE</text>
    <line x1="85" y1="100" x2="740" y2="100" stroke="#22303d" stroke-dasharray="4"/>
    <line x1="85" y1="180" x2="740" y2="180" stroke="#22303d" stroke-dasharray="4"/>
    <line x1="85" y1="260" x2="740" y2="260" stroke="#22303d" stroke-dasharray="4"/>
    <line x1="85" y1="340" x2="740" y2="340" stroke="#22303d" stroke-dasharray="4"/>
    <text x="400" y="200" fill="#9db0c2" font-family="sans-serif" font-size="14" text-anchor="middle">
      Serviço Rust Plotters na porta 18080 indisponível no momento.
    </text>
    <text x="400" y="230" fill="#677e94" font-family="sans-serif" font-size="12" text-anchor="middle">
      Utilize a visualização &quot;Interativo&quot; com candles reais da Binance ou inicie o backend Rust.
    </text>
  </svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
      "X-Backend-Source": "mercury-fallback-svg",
    },
  });
}
