import { NextResponse } from "next/server";
import { analyzeWyckoff, type MarketCandle, type WyckoffAnalysis } from "@/crypto_utils/wyckoff.ts";

export type cryptoRequest = {
  coin: string;
  time?: string;
  requestID?: string;
  status?: string;
  message?: string;
  data?: unknown;
};

export interface CandlePoint {
  time: number;
  value: number;
}

export interface TickerSummary {
  price: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
}

export interface CryptoApiResponse {
  status: "success" | "error";
  message?: string;
  source?: string;
  coin?: string;
  headersProcessed?: {
    receivedFromFront: {
      "x-crypto-symbol": string | null;
      "x-crypto-network": string | null;
      "x-crypto-tier": string | null;
    };
    sentToUpstream: Record<string, string>;
  };
  ticker?: TickerSummary;
  chartData?: CandlePoint[];
  candles?: MarketCandle[];
  analysis?: {
    accumulation: WyckoffAnalysis;
    distribution: WyckoffAnalysis;
  };
  plotUrl?: string;
  data?: unknown;
}

export async function GET(
  request: Request,
): Promise<NextResponse<CryptoApiResponse>> {
  const clientSymbol = request.headers.get("x-crypto-symbol");
  const clientNetwork = request.headers.get("x-crypto-network");
  const clientTier = request.headers.get("x-crypto-tier");

  const { searchParams } = new URL(request.url);
  const rawCoin = clientSymbol || searchParams.get("coin") || "BTCUSDT";
  const coin = rawCoin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "BTCUSDT";
  const interval = searchParams.get("interval") || "4h";

  const dynamicUpstreamHeaders: Record<string, string> = {
    "x-selected-coin": coin,
    "x-selected-network": clientNetwork || "Standard",
    "x-asset-tier": clientTier || "Tier-1",
  };

  const CROW_URL = process.env.CROW_API_URL || process.env.CROW_URL || "http://127.0.0.1:18080";

  let ticker: TickerSummary | null = null;
  let candles: MarketCandle[] = [];
  let chartData: CandlePoint[] = [];
  let source = "crow-cpp";

  // 1. Tenta obter dados do microserviço C++ Crow
  try {
    const crowRes = await fetch(`${CROW_URL}/api/value?coin=${encodeURIComponent(coin)}&count=120`, {
      headers: {
        "x-crypto-symbol": coin,
        "x-crypto-network": clientNetwork || "Standard",
        "x-crypto-tier": clientTier || "Tier-1",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });

    if (crowRes.ok) {
      const crowData = await crowRes.json();
      if (crowData.status === "success" && crowData.ticker) {
        ticker = {
          price: Number(crowData.ticker.price),
          changePercent: Number(crowData.ticker.changePercent),
          high: Number(crowData.ticker.high),
          low: Number(crowData.ticker.low),
          volume: Number(crowData.ticker.volume),
        };

        if (Array.isArray(crowData.chartData)) {
          chartData = crowData.chartData.map((pt: { time: number; value: number }) => ({
            time: Math.floor(Number(pt.time)),
            value: Number(pt.value),
          }));
        }

        if (Array.isArray(crowData.candles) && crowData.candles.length > 0) {
          candles = crowData.candles.map((c: { time: number; open: number; high: number; low: number; close: number; volume: number }) => ({
            time: Math.floor(Number(c.time)),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume),
          }));
        }
      }
    }
  } catch {
    // Crow indisponível temporariamente
  }

  // 2. Se as klines da Binance estiverem acessíveis publicamente, busca candles históricos para enriquecer a série
  try {
    const klinesRes = await fetch(
      `https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(coin)}&interval=${encodeURIComponent(interval)}&limit=120`,
      { cache: "no-store", signal: AbortSignal.timeout(4000) }
    );

    if (klinesRes.ok) {
      const klines = await klinesRes.json();
      if (Array.isArray(klines) && klines.length >= 10) {
        const binanceCandles: MarketCandle[] = klines.map((k: (string | number)[]) => ({
          time: Math.floor(Number(k[0]) / 1000),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
        }));

        candles = binanceCandles;

        if (!ticker && binanceCandles.length > 0) {
          const lastCandle = binanceCandles[binanceCandles.length - 1];
          const firstCandle = binanceCandles[0];
          const changePercent = firstCandle.open > 0 ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100 : 0;
          const high = Math.max(...binanceCandles.map((c) => c.high));
          const low = Math.min(...binanceCandles.map((c) => c.low));
          const volume = binanceCandles.reduce((acc, c) => acc + c.volume, 0);

          ticker = {
            price: lastCandle.close,
            changePercent,
            high,
            low,
            volume,
          };
          source = "binance-public";
        }
      }
    }
  } catch {
    // Mantém dados do Crow
  }

  // 3. Fallback inteligente se nem Crow nem Binance responderam
  if (!ticker) {
    const basePrice = coin.includes("BTC") ? 80600 : coin.includes("ETH") ? 3500 : coin.includes("SOL") ? 175 : 100;
    ticker = {
      price: basePrice,
      changePercent: 1.25,
      high: basePrice * 1.03,
      low: basePrice * 0.97,
      volume: 15420,
    };
    source = "simulation-fallback";
  }

  // 4. Se ainda não há candles suficientes, sintetiza a partir do ticker
  if (candles.length < 60) {
    const nowSec = Math.floor(Date.now() / 1000);
    const intervalSec = interval === "1h" ? 3600 : interval === "1d" ? 86400 : 14400;
    const generated: MarketCandle[] = [];

    for (let i = 80; i >= 0; i--) {
      const t = nowSec - i * intervalSec;
      const wave = Math.sin(i * 0.2) * (ticker.price * 0.02) + Math.cos(i * 0.08) * (ticker.price * 0.015);
      const close = ticker.price + wave;
      const prevClose = generated.length > 0 ? generated[generated.length - 1].close : close * 0.998;
      const open = prevClose;
      const high = Math.max(open, close) * 1.004;
      const low = Math.min(open, close) * 0.996;
      const volume = (ticker.volume / 80) * (1 + Math.abs(Math.sin(i)));

      generated.push({ time: t, open, high, low, close, volume });
    }
    candles = generated;
  }

  if (chartData.length === 0) {
    chartData = candles.map((c) => ({ time: c.time, value: c.close }));
  }

  // 5. Calcula análise Wyckoff
  const accumulation = analyzeWyckoff(candles, "accumulation");
  const distribution = analyzeWyckoff(candles, "distribution");

  return NextResponse.json(
    {
      status: "success",
      source,
      coin,
      headersProcessed: {
        receivedFromFront: {
          "x-crypto-symbol": clientSymbol,
          "x-crypto-network": clientNetwork,
          "x-crypto-tier": clientTier,
        },
        sentToUpstream: dynamicUpstreamHeaders,
      },
      ticker,
      candles,
      chartData,
      analysis: {
        accumulation,
        distribution,
      },
      plotUrl: `/api/plot?coin=${encodeURIComponent(coin)}`,
    },
    { status: 200 }
  );
}
