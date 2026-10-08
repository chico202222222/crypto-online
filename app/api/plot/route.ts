import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCoin = searchParams.get("coin") || "BTCUSDT";
  const coin = rawCoin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTCUSDT";

  const RUST_URL = process.env.RUST_API_URL || process.env.CROW_API_URL || process.env.CROW_URL || "http://127.0.0.1:18080";

  try {
    const res = await fetch(`${RUST_URL}/api/plot?coin=${encodeURIComponent(coin)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: "error", message: "Erro ao gerar plot pelo serviço Rust" },
        { status: 502 }
      );
    }

    const imageBuffer = await res.arrayBuffer();
    const dataSource = res.headers.get("x-data-source") || "unknown";
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": dataSource === "simulated" ? "no-store" : "public, max-age=15, stale-while-revalidate=30",
        "X-Backend-Source": "rust-plotters",
        "X-Data-Source": dataSource,
      },
    });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Microserviço Rust inacessível" },
      { status: 503 }
    );
  }
}
