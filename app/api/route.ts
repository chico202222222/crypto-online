import { NextResponse } from "next/server";

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
  data?: unknown;
}

export async function GET(
  request: Request,
): Promise<NextResponse<CryptoApiResponse>> {
  const API_KEY = process.env.CRYPTO_API_KEY || process.env.CRIPTO_API_KEY;

  if (!API_KEY) {
    return NextResponse.json(
      { status: "error", message: "API Key not found in .env" },
      { status: 500 },
    );
  }

  const clientSymbol = request.headers.get("x-crypto-symbol");
  const clientNetwork = request.headers.get("x-crypto-network");
  const clientTier = request.headers.get("x-crypto-tier");

  const { searchParams } = new URL(request.url);
  const coin = clientSymbol || searchParams.get("coin") || "BTCUSDT";

  const dynamicUpstreamHeaders: Record<string, string> = {
    "X-MBX-APIKEY": API_KEY,
    "x-selected-coin": coin,
    "x-selected-network": clientNetwork || "Standard",
    "x-asset-tier": clientTier || "Tier-1",
  };

  try {
    const [tickerRes, klinesRes] = await Promise.all([
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${coin}`, {
        headers: dynamicUpstreamHeaders,
      }),
      fetch(
        `https://api.binance.com/api/v3/klines?symbol=${coin}&interval=1h&limit=24`,
        {
          headers: dynamicUpstreamHeaders,
        },
      ),
    ]);

    const ticker = await tickerRes.json();
    const klines = await klinesRes.json();

    if (
      !tickerRes.ok ||
      !klinesRes.ok ||
      ticker.code ||
      !Array.isArray(klines)
    ) {
      return NextResponse.json(
        {
          status: "error",
          message: ticker.msg || "Falha ao obter dados da moeda",
          coin,
        },
        { status: 404 },
      );
    }

    const chartData: CandlePoint[] = klines.map(
      (candle: (string | number)[]) => ({
        time: Math.floor(Number(candle[0]) / 1000),
        value: Number(candle[4]),
      }),
    );

    return NextResponse.json(
      {
        status: "success",
        coin,
        headersProcessed: {
          receivedFromFront: {
            "x-crypto-symbol": clientSymbol,
            "x-crypto-network": clientNetwork,
            "x-crypto-tier": clientTier,
          },
          sentToUpstream: dynamicUpstreamHeaders,
        },
        ticker: {
          price: Number(ticker.lastPrice),
          changePercent: Number(ticker.priceChangePercent),
          high: Number(ticker.highPrice),
          low: Number(ticker.lowPrice),
          volume: Number(ticker.volume),
        },
        chartData,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: "Erro ao comunicar com o servidor da API" },
      { status: 500 },
    );
  }
}
