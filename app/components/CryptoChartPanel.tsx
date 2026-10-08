"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { MarketCandle, WyckoffAnalysis, WyckoffKind, WyckoffPhase } from "@/crypto_utils/wyckoff";
import { WyckoffChart } from "./WyckoffChart";

interface Coin {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

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

const POPULAR = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"];
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
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
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
  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [result, setResult] = useState<{ key: string; data?: MarketPayload; error?: string } | null>(null);
  const [viewMode, setViewMode] = useState<"interactive" | "matplot">("interactive");

  useEffect(() => {
    const querySymbol = new URLSearchParams(window.location.search).get("coin")?.toUpperCase();
    const frame = querySymbol && /^[\p{L}\p{N}]{1,16}USDT$/u.test(querySymbol)
      ? window.requestAnimationFrame(() => setSelectedCoin(querySymbol)) : null;
    const handleSelection = (event: Event) => {
      const symbol = (event as CustomEvent<unknown>).detail;
      if (typeof symbol === "string" && /^[\p{L}\p{N}]{1,16}USDT$/u.test(symbol)) selectSymbol(symbol, setSelectedCoin);
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
        if (!response.ok || payload.status !== "success" || !Array.isArray(payload.coins)) throw new Error(payload.message || "Catálogo indisponível.");
        setCoins(payload.coins);
      })
      .catch((error) => { if (!controller.signal.aborted) setCatalogError(error.message || "Catálogo indisponível."); });
    return () => controller.abort();
  }, []);

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
          if (!response.ok || payload.status !== "success" || !payload.ticker || !Array.isArray(payload.candles) || !payload.analysis) {
            throw new Error(payload.message || "Dados indisponíveis.");
          }
          setResult({ key, data: payload as MarketPayload });
        })
        .catch((error) => { if (!signal.aborted) setResult({ key, error: error.message || "Dados indisponíveis." }); });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { window.clearInterval(timer); controller?.abort(); };
  }, [selectedCoin, interval]);

  const current = result?.key === `${selectedCoin}:${interval}` ? result : null;
  const market = current?.data?.ticker;
  const analysis = current?.data?.analysis[kind] ?? null;
  const candles = current?.data?.candles ?? EMPTY_CANDLES;
  const asset = coins.find((coin) => coin.symbol === selectedCoin)?.baseAsset ?? selectedCoin.slice(0, -4);
  const color = kind === "accumulation" ? "#75a7ff" : "#ef8588";

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = search.trim().toUpperCase().replace(/\s+/g, "");
    const found = coins.find((coin) => coin.symbol === typed || coin.baseAsset === typed);
    const symbol = found?.symbol ?? (coins.length === 0 && /^[\p{L}\p{N}]{1,16}USDT$/u.test(typed) ? typed : null);
    if (!symbol) { setSelectionError("Escolha um par USDT do catálogo."); return; }
    setSelectionError("");
    setSearch("");
    selectSymbol(symbol, setSelectedCoin);
  }

  return (
    <section id="markets" className="w-full space-y-5">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">Mercado analisado</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{asset} / USDT</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{coins.length ? `${coins.length} pares disponíveis` : catalogError || "Carregando pares disponíveis..."}</p>
          </div>
          <form onSubmit={submitSearch} className="w-full max-w-md">
            <label htmlFor="coin-search" className="mb-2 block text-xs font-medium text-[var(--muted)]">Buscar moeda ou par</label>
            <div className="flex gap-2">
              <input id="coin-search" type="search" list="coin-options" value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="Ex.: BTC ou BTCUSDT" autoComplete="off"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]" />
              <datalist id="coin-options">{coins.map((coin) => <option key={coin.symbol} value={coin.symbol} label={coin.baseAsset} />)}</datalist>
              <button type="submit" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0b1117] hover:opacity-85">Exibir</button>
            </div>
            {selectionError && <p role="alert" className="mt-2 text-xs text-rose-400">{selectionError}</p>}
          </form>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Pares populares">
          {POPULAR.filter((coin) => !coins.length || coins.some((item) => item.baseAsset === coin)).map((coin) => {
            const symbol = `${coin}USDT`;
            return <button key={coin} type="button" onClick={() => selectSymbol(symbol, setSelectedCoin)} aria-pressed={selectedCoin === symbol}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${selectedCoin === symbol
                ? "border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--foreground)]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}>{coin}</button>;
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-col gap-5 border-b border-[var(--border)] p-4 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.17em]" style={{ color }}>Leitura de estrutura</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h3 className="text-xl font-semibold text-[var(--foreground)] sm:text-2xl">{kind === "accumulation" ? "Acumulação" : "Distribuição"}</h3>
              <span className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider" style={{ borderColor: color, color }}>
                {analysis?.phase ? `Fase ${analysis.phase}` : "Sem sequência validada"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 font-mono text-[10px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Crow C++ (:18080)
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              {analysis?.phase ? `${analysis.events.length} eventos observados em candles fechados. Confira cada marcação no gráfico.`
                : "Os candles recentes ainda não formam uma sequência suficiente para marcar fases de Wyckoff."}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <fieldset>
              <legend className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">Gráfico</legend>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[#0d151d] p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("interactive")}
                  aria-pressed={viewMode === "interactive"}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "interactive" ? "bg-[var(--surface-raised)] text-white" : "text-[var(--muted)] hover:text-white"}`}
                >
                  Interativo
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("matplot")}
                  aria-pressed={viewMode === "matplot"}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "matplot" ? "bg-[var(--surface-raised)] text-white" : "text-[var(--muted)] hover:text-white"}`}
                >
                  Plot C++
                </button>
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">Estrutura</legend>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[#0d151d] p-1">
                {(["accumulation", "distribution"] as const).map((value) => <button key={value} type="button" onClick={() => setKind(value)}
                  aria-pressed={kind === value} className={`rounded-md px-3 py-1.5 text-xs font-medium ${kind === value ? "bg-[var(--surface-raised)] text-white" : "text-[var(--muted)] hover:text-white"}`}>
                  {value === "accumulation" ? "Acumulação" : "Distribuição"}</button>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">Intervalo</legend>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[#0d151d] p-1">
                {INTERVALS.map((item) => <button key={item.value} type="button" onClick={() => setInterval(item.value)}
                  aria-pressed={interval === item.value} className={`rounded-md px-3 py-1.5 text-xs font-medium ${interval === item.value ? "bg-[var(--surface-raised)] text-white" : "text-[var(--muted)] hover:text-white"}`}>
                  {item.label}</button>)}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-[var(--border)] sm:grid-cols-4">
          <Metric label="Preço atual" value={market ? `$${formatPrice(market.price)}` : "—"} />
          <Metric label="Variação em 24 horas" value={market ? `${market.changePercent >= 0 ? "+" : ""}${market.changePercent.toFixed(2)}%` : "—"}
            tone={market && market.changePercent >= 0 ? "#75cba2" : "#e39095"} />
          <Metric label={`Suporte ${analysis?.levelSource === "recent" ? "recente" : "da estrutura"}`}
            value={analysis?.support ? `$${formatPrice(analysis.support)}` : "—"} tone="#80c699" />
          <Metric label={`Resistência ${analysis?.levelSource === "recent" ? "recente" : "da estrutura"}`}
            value={analysis?.resistance ? `$${formatPrice(analysis.resistance)}` : "—"} tone="#e39095" />
        </div>

        <div className={`relative px-1 pt-4 sm:px-4 ${kind === "accumulation"
          ? "bg-[radial-gradient(ellipse_at_top,#182b46_0%,#101923_65%)]"
          : "bg-[radial-gradient(ellipse_at_top,#3b1821_0%,#17151c_65%)]"}`}>
          {viewMode === "interactive" ? (
            <WyckoffChart candles={candles} analysis={analysis} kind={kind} precision={pricePrecision(market?.price ?? 1)} />
          ) : (
            <div className="flex flex-col items-center justify-center py-6 min-h-[440px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${selectedCoin}-${current?.key ?? interval}`}
                src={`/api/plot?coin=${encodeURIComponent(selectedCoin)}`}
                alt={`Gráfico Matplot++ Crow para ${selectedCoin}`}
                className="max-h-[420px] w-auto rounded-xl border border-[var(--border)] bg-[#0d141d] p-1 shadow-2xl object-contain"
              />
              <span className="mt-3 font-mono text-[11px] text-[var(--muted)]">
                Renderizado pelo motor nativo C++ Crow (Matplot++ & gnuplot) · porta 18080
              </span>
            </div>
          )}
          {(!current || current.error) && <div className="absolute inset-0 flex items-center justify-center bg-[#111b26]/90 p-6 text-center text-sm text-[var(--muted)]" role="status">
            {!current ? "Calculando estrutura e carregando candles..." : current.error}
          </div>}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] px-4 py-3 font-mono text-[10px] text-[var(--muted)] sm:px-6">
          <span>{candles.length} candles de preço e volume · Alimentado por Crow C++ (:18080) via CPR</span>
          <span>Atualização automática a cada 60s</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">Fases da leitura</p>
          <div className="mt-5 grid grid-cols-5 gap-1.5" aria-label="Progresso das fases Wyckoff">
            {PHASES.map((phase) => <div key={phase} className="min-w-0">
              <div className="h-1.5 rounded-full" style={{ background: analysis?.phase && phase <= analysis.phase ? color : "#344351" }} />
              <span className={`mt-2 block font-mono text-xs ${analysis?.phase === phase ? "text-white" : "text-[var(--muted)]"}`}>{phase}</span>
            </div>)}
          </div>
          <p className="mt-5 text-sm leading-6 text-[var(--muted)]">{analysis?.phase
            ? "A estrutura é uma leitura por regras de preço e volume. A fase atual pode mudar com novos candles fechados."
            : "Os níveis mostrados vêm da faixa recente. Eles ainda não definem uma estrutura de acumulação ou distribuição."}</p>
          {analysis?.observedUntil ? <p className="mt-4 font-mono text-[11px] text-[#8191a1]">Último candle analisado: {formatTime(analysis.observedUntil)}</p> : null}
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">Eventos identificados</p>
            <span className="font-mono text-[11px] text-[var(--muted)]">{analysis?.events.length ?? 0} sinais</span>
          </div>
          {analysis?.events.length ? <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {analysis.events.map((event) => <li key={`${event.code}-${event.time}`} className="flex gap-3 rounded-lg border border-[var(--border)] bg-[#0e1720] px-3 py-3">
              <span className="w-12 shrink-0 font-mono text-xs font-semibold" style={{ color }}>{event.code}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white">{event.label}</p>
                <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{formatTime(event.time)} · volume {event.volumeRatio.toFixed(1)}× média</p>
              </div>
            </li>)}
          </ol> : <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Nenhum clímax, reação e teste secundário passaram juntos pelos critérios neste intervalo.</p>}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="border-b border-r border-[var(--border)] p-4 last:border-r-0 sm:border-b-0 sm:p-5">
    <p className="text-xs text-[var(--muted)]">{label}</p>
    <p className="mt-1 font-mono text-lg font-semibold tabular-nums sm:text-xl" style={{ color: tone ?? "#ffffff" }}>{value}</p>
  </div>;
}
