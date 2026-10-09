import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { enrichCoin, FALLBACK_COINS, type CoinMetadata } from "@/crypto_utils/coins";

interface ExchangeSymbol {
  symbol?: unknown;
  baseAsset?: unknown;
  quoteAsset?: unknown;
  status?: unknown;
  isSpotTradingAllowed?: unknown;
}

async function fetchBinanceExchangeInfo(): Promise<ExchangeSymbol[]> {
  const endpoints = [
    "https://data-api.binance.vision/api/v3/exchangeInfo?symbolStatus=TRADING&showPermissionSets=false",
    "https://api.binance.com/api/v3/exchangeInfo?symbolStatus=TRADING&showPermissionSets=false",
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (data && typeof data === "object" && "symbols" in data && Array.isArray(data.symbols)) {
        return data.symbols as ExchangeSymbol[];
      }
    } catch {
      // Tentar próximo endpoint
    }
  }

  throw new Error("Exchange info indisponível em todos os endpoints");
}

const getCoins = unstable_cache(
  async (): Promise<CoinMetadata[]> => {
    const rawSymbols = await fetchBinanceExchangeInfo();

    const coins: CoinMetadata[] = rawSymbols
      .filter(
        (item) =>
          item &&
          typeof item === "object" &&
          item.status === "TRADING" &&
          (item.isSpotTradingAllowed === true || item.isSpotTradingAllowed === undefined) &&
          item.quoteAsset === "USDT" &&
          typeof item.symbol === "string" &&
          /^[\p{L}\p{N}]{1,16}USDT$/u.test(item.symbol) &&
          typeof item.baseAsset === "string"
      )
      .map((item) => enrichCoin(item.symbol as string, item.baseAsset as string, "USDT"))
      .sort((a, b) => {
        // Priorizar populares primeiro, depois ordem alfabética
        if (a.isPopular && !b.isPopular) return -1;
        if (!a.isPopular && b.isPopular) return 1;
        return a.baseAsset.localeCompare(b.baseAsset);
      });

    if (coins.length === 0) {
      return FALLBACK_COINS;
    }

    return coins;
  },
  ["spot-usdt-coins-v2"],
  { revalidate: 3600 }
);

export async function GET() {
  try {
    const coins = await getCoins();
    return NextResponse.json({ status: "success", coins, total: coins.length });
  } catch {
    return NextResponse.json({ status: "success", coins: FALLBACK_COINS, total: FALLBACK_COINS.length });
  }
}
