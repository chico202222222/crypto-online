"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { MarketCandle, WyckoffAnalysis, WyckoffKind, WyckoffPhase } from "@/crypto_utils/wyckoff";
import { WyckoffChart } from "./WyckoffChart";
import { CoinSelectorModal } from "./CoinSelectorModal";
import { LivePriceTracker } from "./LivePriceTracker";
import {
  COIN_CATEGORIES,
  type CoinCategory,
  type CoinMetadata,
  FALLBACK_COINS,
} from "@/crypto_utils/coins";

interface MarketData {
  price: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
}

interface MarketPayload {
  ticker: MarketData;
  candles: MarketCandle[];
  analysis: { accumulation: WyckoffAnalysis; distribution: WyckoffAnalysis };
  source?: string;
  plotUrl?: string;
}

type Interval = "1h" | "4h" | "1d";

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1h", label: "1 hora" },
  { value: "4h", label: "4 horas" },
  { value: "1d", label: "1 dia" },
];
const PHASES: WyckoffPhase[] = ["A", "B", "C", "D", "E"];
const EMPTY_CANDLES: MarketCandle[] = [];

function pricePrecision(price: number) {
  if (price >= 1) return 2;
  if (price >= 0.01) return 4;
  if (price >= 0.0001) return 6;
  if (price >= 0.000001) return 8;
  return 10;
}

function formatPrice(price: number) {
  const precision = pricePrecision(price);
  return price.toLocaleString("en-US", {
    minimumFractionDigits: precision === 2 ? 2 : 0,
    maximumFractionDigits: precision,
  });
}

function formatTime(time: number) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time * 1000);
}

function selectSymbol(symbol: string, setSelected: (symbol: string) => void) {
  setSelected(symbol);
  const url = new URL(window.location.href);
  url.searchParams.set("coin", symbol);
  window.history.replaceState(null, "", url);
}

export function CryptoChartPanel() {
  const [selectedCoin, setSelectedCoin] = useState("BTCUSDT");
  const [interval, setInterval] = useState<Interval>("4h");
  const [kind, setKind] = useState<WyckoffKind>("accumulation");
  const [coins, setCoins] = useState<CoinMetadata[]>(FALLBACK_COINS);
  const [selectedCategory, setSelectedCategory] = useState<CoinCategory>("top");
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [result, setResult] = useState<{ key: string; data?: MarketPayload; error?: string } | null>(null);
  const [viewMode, setViewMode] = useState<"interactive" | "plot">("interactive");

  // Estados de Acompanhamento em Tempo Real
  const [isLive, setIsLive] = useState(false);
  const [priceTone, setPriceTone] = useState<"up" | "down" | "neutral">("neutral");
  const [lastTickTime, setLastTickTime] = useState<Date | null>(null);
  const [connectionType, setConnectionType] = useState<"websocket" | "polling" | "connecting">("connecting");
  const activeConnectionType = isLive ? connectionType : "idle";

  useEffect(() => {
    const querySymbol = new URLSearchParams(window.location.search).get("coin")?.toUpperCase();
    const frame =
      querySymbol && /^[\p{L}\p{N}]{1,16}USDT$/u.test(querySymbol)
        ? window.requestAnimationFrame(() => setSelectedCoin(querySymbol))
        : null;
    const handleSelection = (event: Event) => {
      const symbol = (event as CustomEvent<unknown>).detail;
      if (typeof symbol === "string" && /^[\p{L}\p{N}]{1,16}USDT$/u.test(symbol))
        selectSymbol(symbol, setSelectedCoin);
    };
    window.addEventListener("crypto:select", handleSelection);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("crypto:select", handleSelection);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coins", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || payload.status !== "success" || !Array.isArray(payload.coins))
          throw new Error(payload.message || "Catálogo indisponível.");
        setCoins(payload.coins);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCatalogError(error.message || "Catálogo indisponível.");
      });
    return () => controller.abort();
  }, []);

  // Carga base dos dados e atualização a cada 60s
  useEffect(() => {
    let controller: AbortController | null = null;
    const key = `${selectedCoin}:${interval}`;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      fetch(`/api?coin=${encodeURIComponent(selectedCoin)}&interval=${interval}`, { signal })
        .then(async (response) => {
          const payload = await response.json();
          if (signal.aborted) return;
          if (
            !response.ok ||
            payload.status !== "success" ||
            !payload.ticker ||
            !Array.isArray(payload.candles) ||
            !payload.analysis
          ) {
            throw new Error(payload.message || "Dados indisponíveis.");
          }
          setResult({ key, data: payload as MarketPayload });
        })
        .catch((error) => {
          if (!signal.aborted) setResult({ key, error: error.message || "Dados indisponíveis." });
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [selectedCoin, interval]);

  // Reset do flash de cor do preço
  useEffect(() => {
    if (priceTone === "neutral") return;
    const timer = window.setTimeout(() => setPriceTone("neutral"), 800);
    return () => window.clearTimeout(timer);
  }, [priceTone]);

  // Motor de Acompanhamento em Tempo Real (WebSocket com contingência de Polling rápido)
  useEffect(() => {
    if (!isLive) return;

    let ws: WebSocket | null = null;
    let fallbackTimer: number | null = null;
    let isCancelled = false;
    let fallbackStarted = false;

    const startPollingFallback = () => {
      if (isCancelled || fallbackStarted) return;
      fallbackStarted = true;
      setConnectionType("polling");
      const poll = async () => {
        try {
          const res = await fetch(`/api?coin=${encodeURIComponent(selectedCoin)}&interval=${interval}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === "success" && data.ticker) {
              setResult((prev) => {
                if (!prev) return { key: `${selectedCoin}:${interval}`, data };
                const prevPrice = prev.data?.ticker.price;
                if (prevPrice && data.ticker.price > prevPrice) {
                  setPriceTone("up");
                } else if (prevPrice && data.ticker.price < prevPrice) {
                  setPriceTone("down");
                }
                return { ...prev, data };
              });
              setLastTickTime(new Date());
            }
          }
        } catch {
          // Erro pontual de rede ignorado
        }
      };
      fallbackTimer = window.setInterval(poll, 3000);
      void poll();
    };

    try {
      const streamSymbol = selectedCoin.toLowerCase();
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSymbol}@ticker`);

      ws.onopen = () => {
        if (!isCancelled) {
          setConnectionType("websocket");
        }
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const data = JSON.parse(event.data);
          if (data && data.c) {
            const newPrice = parseFloat(data.c);
            const changePercent = parseFloat(data.P) || 0;
            const high = parseFloat(data.h) || newPrice;
            const low = parseFloat(data.l) || newPrice;
            const volume = parseFloat(data.v) || 0;

            setResult((prev) => {
              if (!prev?.data?.ticker) return prev;
              const prevPrice = prev.data.ticker.price;
              if (newPrice > prevPrice) {
                setPriceTone("up");
              } else if (newPrice < prevPrice) {
                setPriceTone("down");
              }

              const updatedTicker: MarketData = {
                price: newPrice,
                changePercent,
                high,
                low,
                volume,
              };

              let updatedCandles = prev.data.candles;
              if (updatedCandles && updatedCandles.length > 0) {
                const lastIdx = updatedCandles.length - 1;
                const last = updatedCandles[lastIdx];
                const updatedLast: MarketCandle = {
                  ...last,
                  close: newPrice,
                  high: Math.max(last.high, newPrice),
                  low: Math.min(last.low, newPrice),
                };
                updatedCandles = [...updatedCandles.slice(0, lastIdx), updatedLast];
              }

              return {
                ...prev,
                data: {
                  ...prev.data,
                  ticker: updatedTicker,
                  candles: updatedCandles,
                },
              };
            });

            setLastTickTime(new Date());
          }
        } catch {
          // Erro de parse ignorado
        }
      };

      ws.onerror = () => {
        if (!isCancelled) {
          startPollingFallback();
        }
      };

      ws.onclose = () => {
        if (!isCancelled) {
          startPollingFallback();
        }
      };
    } catch {
      startPollingFallback();
    }

    return () => {
      isCancelled = true;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      if (fallbackTimer !== null) {
        window.clearInterval(fallbackTimer);
      }
    };
  }, [isLive, selectedCoin, interval]);

  const current = result?.key === `${selectedCoin}:${interval}` ? result : null;
  const market = current?.data?.ticker;
  const analysis = current?.data?.analysis[kind] ?? null;
  const candles = current?.data?.candles ?? EMPTY_CANDLES;
  const dataSource = current?.data?.source;

  const currentCoinObj = coins.find((coin) => coin.symbol === selectedCoin);
  const asset = currentCoinObj?.baseAsset ?? selectedCoin.slice(0, -4);
  const assetName = currentCoinObj?.name;
  const color = kind === "accumulation" ? "#75a7ff" : "#ef8588";

  const categoryCoins = useMemo(() => {
    if (selectedCategory === "all") return coins.slice(0, 30);
    if (selectedCategory === "top") {
      const topList = coins.filter((c) => c.isPopular || c.category === "top");
      return topList.length ? topList.slice(0, 20) : coins.slice(0, 20);
    }
    const filtered = coins.filter((c) => c.category === selectedCategory);
    return filtered.length ? filtered.slice(0, 20) : coins.slice(0, 20);
  }, [coins, selectedCategory]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = search.trim().toUpperCase().replace(/\s+/g, "");
    if (!typed) return;

    const found = coins.find(
      (coin) =>
        coin.symbol === typed ||
        coin.baseAsset === typed ||
        coin.name.toUpperCase() === typed ||
        coin.symbol === `${typed}USDT`
    );

    const symbol =
      found?.symbol ??
      (/^[\p{L}\p{N}]{1,16}USDT$/u.test(typed)
        ? typed
        : /^[\p{L}\p{N}]{1,10}$/u.test(typed)
        ? `${typed}USDT`
        : null);

    if (!symbol) {
      setSelectionError("Escolha um par USDT válido do catálogo.");
      return;
    }
    setSelectionError("");
    setSearch("");
    selectSymbol(symbol, setSelectedCoin);
  }

  return (
    <section id="markets" className="w-full space-y-5">
      {/* Bloco Superior: Cabeçalho com Par Atual, Botão de Tempo Real e Busca */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
                Par spot analisado
              </span>
              <span className="h-1 w-1 rounded-full bg-[var(--accent)]" />
              <span className="font-mono text-[11px] text-[var(--muted)]">
                Binance
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                {asset} <span className="text-[var(--muted)] font-normal">/ USDT</span>
              </h2>
              {assetName && assetName !== asset && (
                <span className="rounded-md border border-[var(--border)] bg-[#121c27] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                  {assetName}
                </span>
              )}
              <button
                type="button"
                onClick={() => setIsExplorerOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[#101923] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-white"
              >
                <span>Catálogo</span>
                <span className="text-[10px]">▼</span>
              </button>

              {/* Botão de Acompanhar em Tempo Real */}
              <LivePriceTracker
                isLive={isLive}
                onToggleLive={() => setIsLive((prev) => !prev)}
                lastTickTime={lastTickTime}
                connectionType={activeConnectionType}
              />
            </div>

            <p className="text-xs text-[var(--muted)]">
              {coins.length
                ? `${coins.length} pares spot disponíveis`
                : catalogError || "Carregando catálogo completo..."}
            </p>
          </div>

          {/* Campo de Busca Rápida Simplificado */}
          <form onSubmit={submitSearch} className="w-full max-w-sm">
            <div className="relative flex items-center">
              <input
                id="coin-search"
                type="search"
                list="coin-options"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar par (ex.: BTC, SOL, ETH)..."
                autoComplete="off"
                aria-label="Buscar moeda ou par spot"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] py-2.5 pl-3.5 pr-20 text-sm text-[var(--foreground)] outline-none placeholder:text-[#657585] focus:border-[var(--accent)] transition-colors"
              />
              <datalist id="coin-options">
                {coins.map((coin) => (
                  <option key={coin.symbol} value={coin.symbol} label={`${coin.baseAsset} - ${coin.name}`} />
                ))}
              </datalist>
              <button
                type="submit"
                className="absolute right-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[#0b1117] transition-opacity hover:opacity-90"
              >
                Ver par
              </button>
            </div>
            {selectionError && <p role="alert" className="mt-1.5 text-xs text-rose-400">{selectionError}</p>}
          </form>
        </div>

        {/* Abas de Categorias Simplificadas */}
        <div className="mt-5 border-t border-[var(--border)]/60 pt-4">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist">
              {COIN_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] font-semibold"
                        : "border border-transparent bg-[#101923] text-[var(--muted)] hover:border-[var(--border)] hover:text-white"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setIsExplorerOpen(true)}
              className="hidden sm:inline-flex shrink-0 font-mono text-[11px] text-[var(--accent)] hover:underline"
            >
              Ver todas ({coins.length || "500+"}) &rarr;
            </button>
          </div>

          {/* Moedas da categoria selecionada */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1" aria-label="Moedas da categoria">
            {categoryCoins.map((coin) => {
              const isSelected = selectedCoin === coin.symbol;
              return (
                <button
                  key={coin.symbol}
                  type="button"
                  onClick={() => selectSymbol(coin.symbol, setSelectedCoin)}
                  aria-pressed={isSelected}
                  className={`group flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all ${
                    isSelected
                      ? "border-[var(--accent)] bg-[var(--surface-raised)] text-white font-semibold shadow-sm"
                      : "border-[var(--border)]/70 bg-[#0e1620] text-[var(--muted)] hover:border-[#3e5264] hover:text-white"
                  }`}
                >
                  <span className={isSelected ? "text-[var(--accent)] font-bold" : "text-[var(--foreground)]"}>
                    {coin.baseAsset}
                  </span>
                  {coin.name && coin.name !== coin.baseAsset && (
                    <span className="hidden text-[10px] text-[#6b7b8b] group-hover:inline sm:inline">
                      · {coin.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Painel Principal do Gráfico e Controles */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] p-4 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.17em]" style={{ color }}>
              Leitura de estrutura
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold text-[var(--foreground)] sm:text-2xl">
                {kind === "accumulation" ? "Acumulação" : "Distribuição"}
              </h3>
              <span
                className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider"
                style={{ borderColor: color, color }}
              >
                {analysis?.phase ? `Fase ${analysis.phase}` : "Sem sequência validada"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 font-mono text-[10px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Rust (:18080)
              </span>
              {dataSource === "simulation-fallback" && (
                <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 font-mono text-[10px] text-amber-300">
                  Dados simulados
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              {analysis?.phase
                ? `${analysis.events.length} eventos observados em candles fechados. Níveis e fases sobrepostas.`
                : "Aguardando formação de sequência de candles para determinação das fases de Wyckoff."}
            </p>
          </div>

          {/* Controles de Visualização: Gráfico, Estrutura e Intervalo */}
          <div className="flex flex-wrap items-end gap-3">
            <fieldset>
              <legend className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Gráfico
              </legend>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[#0d151d] p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("interactive")}
                  aria-pressed={viewMode === "interactive"}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === "interactive" ? "bg-[var(--surface-raised)] text-white" : "text-[var(--muted)] hover:text-white"
                  }`}
                >
                  Interativo
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("plot")}
                  aria-pressed={viewMode === "plot"}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === "plot" ? "bg-[var(--surface-raised)] text-white" : "text-[var(--muted)] hover:text-white"
                  }`}
                >
                  Plot Rust
                </button>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Estrutura
              </legend>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[#0d151d] p-1">
                {(["accumulation", "distribution"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setKind(value)}
                    aria-pressed={kind === value}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      kind === value ? "bg-[var(--surface-raised)] text-white" : "text-[var(--muted)] hover:text-white"
                    }`}
                  >
                    {value === "accumulation" ? "Acumulação" : "Distribuição"}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
                Intervalo
              </legend>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[#0d151d] p-1">
                {INTERVALS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setInterval(item.value)}
                    aria-pressed={interval === item.value}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      interval === item.value ? "bg-[var(--surface-raised)] text-white" : "text-[var(--muted)] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        {/* Grade de Métricas com Destaque para o Preço em Tempo Real */}
        <div className="grid grid-cols-2 border-b border-[var(--border)] sm:grid-cols-4">
          <div
            className={`border-b border-r border-[var(--border)] p-4 sm:p-5 transition-colors duration-300 ${
              priceTone === "up"
                ? "bg-emerald-500/10"
                : priceTone === "down"
                ? "bg-rose-500/10"
                : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--muted)]">Preço atual</p>
              {isLive && (
                <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  ao vivo
                </span>
              )}
            </div>
            <p
              className={`mt-1 font-mono text-lg font-semibold tabular-nums sm:text-2xl transition-colors duration-200 ${
                priceTone === "up"
                  ? "text-emerald-400"
                  : priceTone === "down"
                  ? "text-rose-400"
                  : "text-white"
              }`}
            >
              {market ? `$${formatPrice(market.price)}` : "—"}
            </p>
          </div>

          <Metric
            label="Variação em 24h"
            value={market ? `${market.changePercent >= 0 ? "+" : ""}${market.changePercent.toFixed(2)}%` : "—"}
            tone={market && market.changePercent >= 0 ? "#75cba2" : "#e39095"}
          />
          <Metric
            label={`Suporte ${analysis?.levelSource === "recent" ? "recente" : "da estrutura"}`}
            value={analysis?.support ? `$${formatPrice(analysis.support)}` : "—"}
            tone="#80c699"
          />
          <Metric
            label={`Resistência ${analysis?.levelSource === "recent" ? "recente" : "da estrutura"}`}
            value={analysis?.resistance ? `$${formatPrice(analysis.resistance)}` : "—"}
            tone="#e39095"
          />
        </div>

        {/* Área do Gráfico */}
        <div
          className={`relative px-1 pt-4 sm:px-4 ${
            kind === "accumulation"
              ? "bg-[radial-gradient(ellipse_at_top,#182b46_0%,#101923_65%)]"
              : "bg-[radial-gradient(ellipse_at_top,#3b1821_0%,#17151c_65%)]"
          }`}
        >
          {viewMode === "interactive" ? (
            <WyckoffChart
              candles={candles}
              analysis={analysis}
              kind={kind}
              precision={pricePrecision(market?.price ?? 1)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-6 min-h-[440px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${selectedCoin}-${current?.key ?? interval}`}
                src={`/api/plot?coin=${encodeURIComponent(selectedCoin)}&interval=${interval}`}
                alt={`Gráfico Plotters Rust para ${selectedCoin}`}
                className="max-h-[420px] w-auto rounded-xl border border-[var(--border)] bg-[#0d141d] p-1 shadow-2xl object-contain"
              />
              <span className="mt-3 font-mono text-[11px] text-[var(--muted)]">
                Gerado em memória por Rust e Plotters · Binance API · porta 18080
              </span>
            </div>
          )}
          {(!current || current.error) && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-[#111b26]/90 p-6 text-center text-sm text-[var(--muted)]"
              role="status"
            >
              {!current ? "Calculando estrutura e carregando candles..." : current.error}
            </div>
          )}
        </div>

        {/* Rodapé informativo do gráfico */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-3 font-mono text-[10px] text-[var(--muted)] sm:px-6">
          <span>
            {candles.length} candles de preço e volume · Fonte:{" "}
            {dataSource === "binance-public"
              ? "Binance pública"
              : dataSource === "simulation-fallback"
              ? "simulação"
              : "Rust"}
          </span>
          <span className="flex items-center gap-2">
            {isLive ? (
              <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Stream em tempo real ativo ({activeConnectionType})
              </span>
            ) : (
              <span>Atualização regular a cada 60s</span>
            )}
          </span>
        </div>
      </div>

      {/* Seção Inferior: Fases e Eventos Wyckoff */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 shadow-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
            Fases da leitura
          </p>
          <div className="mt-5 grid grid-cols-5 gap-1.5" aria-label="Progresso das fases Wyckoff">
            {PHASES.map((phase) => (
              <div key={phase} className="min-w-0">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    background:
                      analysis?.phase && phase <= analysis.phase ? color : "#344351",
                  }}
                />
                <span
                  className={`mt-2 block font-mono text-xs ${
                    analysis?.phase === phase ? "text-white font-bold" : "text-[var(--muted)]"
                  }`}
                >
                  {phase}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
            {analysis?.phase
              ? "A estrutura é uma leitura por regras de preço e volume. A fase atual pode mudar com novos candles fechados."
              : "Os níveis mostrados vêm da faixa recente. Eles ainda não definem uma estrutura de acumulação ou distribuição."}
          </p>
          {analysis?.observedUntil ? (
            <p className="mt-4 font-mono text-[11px] text-[#8191a1]">
              Último candle analisado: {formatTime(analysis.observedUntil)}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">
              Eventos identificados
            </p>
            <span className="font-mono text-[11px] text-[var(--muted)]">
              {analysis?.events.length ?? 0} sinais
            </span>
          </div>
          {analysis?.events.length ? (
            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
              {analysis.events.map((event) => (
                <li
                  key={`${event.code}-${event.time}`}
                  className="flex gap-3 rounded-lg border border-[var(--border)] bg-[#0e1720] px-3 py-3"
                >
                  <span className="w-12 shrink-0 font-mono text-xs font-semibold" style={{ color }}>
                    {event.code}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">{event.label}</p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                      {formatTime(event.time)} · volume {event.volumeRatio.toFixed(1)}× média
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              Nenhum clímax, reação e teste secundário passaram juntos pelos critérios neste intervalo.
            </p>
          )}
        </div>
      </div>

      <CoinSelectorModal
        isOpen={isExplorerOpen}
        onClose={() => setIsExplorerOpen(false)}
        coins={coins}
        selectedSymbol={selectedCoin}
        onSelectCoin={(symbol) => selectSymbol(symbol, setSelectedCoin)}
      />
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border-b border-r border-[var(--border)] p-4 last:border-r-0 sm:border-b-0 sm:p-5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p
        className="mt-1 font-mono text-lg font-semibold tabular-nums sm:text-xl"
        style={{ color: tone ?? "#ffffff" }}
      >
        {value}
      </p>
    </div>
  );
}
