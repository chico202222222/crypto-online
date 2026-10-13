import { NextResponse } from "next/server";
import { analyzeWyckoff, type MarketCandle, type WyckoffAnalysis } from "@/crypto_utils/wyckoff.ts";
import { logger, resolveRequestId } from "@/crypto_utils/logger";

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
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = logger.child({ component: "market-api", requestId });
  const clientSymbol = request.headers.get("x-crypto-symbol");
  const clientNetwork = request.headers.get("x-crypto-network");
  const clientTier = request.headers.get("x-crypto-tier");

  const { searchParams } = new URL(request.url);
  const rawCoin = clientSymbol || searchParams.get("coin") || "BTCUSDT";
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
  const interval = searchParams.get("interval") || "4h";

  const dynamicUpstreamHeaders: Record<string, string> = {
    "x-selected-coin": coin,
    "x-selected-network": clientNetwork || "Standard",
    "x-asset-tier": clientTier || "Tier-1",
  };

  const RUST_URL = process.env.RUST_API_URL || process.env.CROW_API_URL || process.env.CROW_URL || "http://127.0.0.1:18080";

  let ticker: TickerSummary | null = null;
  let candles: MarketCandle[] = [];
  let chartData: CandlePoint[] = [];
  let source = "rust";

  // 1. Tenta obter dados do microserviço Rust (que agora possui suporte a klines reais)
  try {
    const rustRes = await fetch(`${RUST_URL}/api/value?coin=${encodeURIComponent(coin)}&interval=${encodeURIComponent(interval)}&count=120`, {
      headers: {
        "x-crypto-symbol": coin,
        "x-crypto-network": clientNetwork || "Standard",
        "x-crypto-tier": clientTier || "Tier-1",
        "x-request-id": requestId,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });

    if (rustRes.ok) {
      const rustData = await rustRes.json();
      if (rustData.status === "success" && rustData.ticker) {
        source = rustData.source === "simulated" ? "simulation-fallback" : "rust-binance-spot";
        ticker = {
          price: Number(rustData.ticker.price),
          changePercent: Number(rustData.ticker.changePercent),
          high: Number(rustData.ticker.high),
          low: Number(rustData.ticker.low),
          volume: Number(rustData.ticker.volume),
        };

        if (Array.isArray(rustData.chartData)) {
          chartData = rustData.chartData.map((pt: { time: number; value: number }) => ({
            time: Math.floor(Number(pt.time)),
            value: Number(pt.value),
          }));
        }

        if (Array.isArray(rustData.candles) && rustData.candles.length > 0) {
          candles = rustData.candles.map((c: { time: number; open: number; high: number; low: number; close: number; volume: number }) => ({
            time: Math.floor(Number(c.time)),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume),
          }));
        }
      }
    } else {
      log.warn("rust upstream non-ok", { coin, status: rustRes.status });
    }
  } catch (error) {
    // Serviço Rust indisponível temporariamente
    log.warn("rust upstream unavailable", { coin, error });
  }

  // 2. Busca candles históricos e ticker 24h diretamente na API Binance pública (com espelho de contingência)
  try {
    const bases = [
      "https://data-api.binance.vision",
      "https://api.binance.com",
    ];

    let rawKlines: unknown = null;
    let rawTicker: Record<string, string | number> | null = null;

    for (const base of bases) {
      if (!rawKlines) {
        try {
          const kRes = await fetch(
            `${base}/api/v3/klines?symbol=${encodeURIComponent(coin)}&interval=${encodeURIComponent(interval)}&limit=120`,
            { cache: "no-store", signal: AbortSignal.timeout(3500) }
          );
          if (kRes.ok) {
            const list = await kRes.json();
            if (Array.isArray(list) && list.length >= 10) {
              rawKlines = list;
            }
          }
        } catch (error) {
          log.debug("binance klines failed", { base, coin, error });
        }
      }

      if (!rawTicker) {
        try {
          const tRes = await fetch(
            `${base}/api/v3/ticker/24hr?symbol=${encodeURIComponent(coin)}`,
            { cache: "no-store", signal: AbortSignal.timeout(3000) }
          );
          if (tRes.ok) {
            rawTicker = await tRes.json();
          }
        } catch (error) {
          log.debug("binance ticker failed", { base, coin, error });
        }
      }

      if (rawKlines && rawTicker) break;
    }

    if (Array.isArray(rawKlines) && rawKlines.length >= 10) {
      const binanceCandles: MarketCandle[] = (rawKlines as (string | number)[][]).map((k) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }));

      // Garante ordenação cronológica estrita e remove eventuais timestamps duplicados
      const sorted = [...binanceCandles].sort((a, b) => a.time - b.time);
      const deduped: MarketCandle[] = [];
      for (const c of sorted) {
        if (deduped.length === 0 || c.time > deduped[deduped.length - 1].time) {
          deduped.push(c);
        }
      }

      candles = deduped;
      chartData = deduped.map((c) => ({ time: c.time, value: c.close }));
      source = "binance-public";

      if (rawTicker && Number(rawTicker.lastPrice) > 0) {
        ticker = {
          price: Number(rawTicker.lastPrice),
          changePercent: Number(rawTicker.priceChangePercent) || 0,
          high: Number(rawTicker.highPrice) || Number(rawTicker.lastPrice),
          low: Number(rawTicker.lowPrice) || Number(rawTicker.lastPrice),
          volume: Number(rawTicker.volume) || 0,
        };
      } else if (!ticker || source === "simulation-fallback") {
        const lastCandle = deduped[deduped.length - 1];
        const firstCandle = deduped[0];
        const changePercent = firstCandle.open > 0 ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100 : 0;
        const high = Math.max(...deduped.map((c) => c.high));
        const low = Math.min(...deduped.map((c) => c.low));
        const volume = deduped.reduce((acc, c) => acc + c.volume, 0);

        ticker = {
          price: lastCandle.close,
          changePercent,
          high,
          low,
          volume,
        };
      }
    }
  } catch (error) {
    // Mantém dados existentes se a chamada direta falhar
    log.warn("binance direct fetch failed", { coin, error });
  }

  // 3. Fallback inteligente se nem Rust nem Binance responderam
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
    log.error("serving simulated data: no upstream available", { coin, interval });
  }

  log.debug("market data resolved", { coin, interval, source, candles: candles.length });

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
