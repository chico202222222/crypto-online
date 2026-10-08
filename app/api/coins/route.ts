import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/crypto_utils";

interface ExchangeSymbol {
  symbol?: unknown;
  baseAsset?: unknown;
  quoteAsset?: unknown;
  status?: unknown;
  isSpotTradingAllowed?: unknown;
}

const getCoins = unstable_cache(
  async () => {
    const response = await fetch(
      "https://data-api.binance.vision/api/v3/exchangeInfo?symbolStatus=TRADING&showPermissionSets=false",
      {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) throw new Error("Exchange info unavailable");
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || !("symbols" in data) || !Array.isArray(data.symbols)) {
      throw new Error("Invalid exchange info");
    }

    const coins = (data.symbols as ExchangeSymbol[])
      .filter(
        (item) =>
          item &&
          typeof item === "object" &&
          item.status === "TRADING" &&
          item.isSpotTradingAllowed === true &&
          item.quoteAsset === "USDT" &&
          typeof item.symbol === "string" &&
          /^[\p{L}\p{N}]{1,16}USDT$/u.test(item.symbol) &&
          typeof item.baseAsset === "string"
      )
      .map((item) => ({
        symbol: item.symbol as string,
        baseAsset: item.baseAsset as string,
        quoteAsset: "USDT",
      }))
      .sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));

    return coins;
  },
  ["spot-usdt-coins-v1"],
  { revalidate: 3600 }
);

export async function GET() {
  const token = (await cookies()).get("crypto_session")?.value;
  if (!token || !(await verifySessionToken(token)).valid) {
    return NextResponse.json({ status: "error", message: "Não autorizado." }, { status: 401 });
  }

  try {
    const coins = await getCoins();
    return NextResponse.json({ status: "success", coins });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Catálogo de mercados indisponível." },
      { status: 502 }
    );
  }
}
