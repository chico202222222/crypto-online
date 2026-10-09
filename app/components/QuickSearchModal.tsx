"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNavigation } from "./NavigationContext";
import { CloseIcon, SearchIcon } from "./icons";
import { COIN_CATEGORIES, type CoinCategory, type CoinMetadata } from "@/crypto_utils/coins";

export function QuickSearchModal() {
  const { isSearchOpen, setIsSearchOpen } = useNavigation();

  if (!isSearchOpen) return null;
  return <QuickSearchDialog onClose={() => setIsSearchOpen(false)} />;
}

function QuickSearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CoinCategory>("all");
  const [coins, setCoins] = useState<CoinMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    inputRef.current?.focus();
    fetch("/api/coins", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Falha ao carregar pares");
        return response.json();
      })
      .then((data: { status: string; coins: CoinMetadata[] }) => {
        if (data.status !== "success" || !Array.isArray(data.coins)) {
          throw new Error("Catálogo indisponível");
        }
        setCoins(data.coins);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toUpperCase();
    return coins
      .filter((coin) => {
        const matchesTerm =
          !term ||
          coin.symbol.includes(term) ||
          coin.baseAsset.includes(term) ||
          (coin.name && coin.name.toUpperCase().includes(term));

        if (!matchesTerm) return false;
        if (term) return true;
        if (category === "all") return true;
        if (category === "top") return coin.isPopular || coin.category === "top";
        return coin.category === category;
      })
      .slice(0, 60);
  }, [coins, query, category]);

  const selectCoin = (symbol: string) => {
    if (window.location.pathname === "/") {
      window.history.replaceState(null, "", `/?coin=${encodeURIComponent(symbol)}`);
      window.dispatchEvent(new CustomEvent("crypto:select", { detail: symbol }));
      onClose();
    } else {
      router.push(`/?coin=${encodeURIComponent(symbol)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]">
      <button
        type="button"
        aria-label="Fechar busca"
        className="absolute inset-0 h-full w-full bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-title"
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0d141d] shadow-[0_24px_80px_rgba(0,0,0,.75)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[#101923] px-5 py-4">
          <div>
            <h2 id="search-title" className="text-sm font-semibold text-[var(--foreground)]">
              Buscar e Selecionar Par de Negociação
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Mercado spot Binance em USDT · Mais de 500 moedas
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar busca"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[#0b1017] px-5 py-3.5">
          <SearchIcon className="h-5 w-5 shrink-0 text-[var(--accent)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results.length > 0) selectCoin(results[0].symbol);
            }}
            aria-label="Símbolo ou nome do ativo"
            placeholder="Digite o código ou nome (ex: BTC, Solana, PEPE, SUI, Aave...)"
            className="w-full bg-transparent text-sm text-[var(--foreground)] placeholder:text-[#5e7182] focus:outline-none"
          />
          <kbd className="hidden rounded bg-[#172330] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] sm:block">ESC</kbd>
        </div>

        {/* Categorias Rápidas */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--border)] bg-[#0f1722] px-4 py-2 scrollbar-none">
          {COIN_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setCategory(cat.id);
                setQuery("");
              }}
              className={`flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                category === cat.id && !query
                  ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "border border-transparent bg-[#141e2a] text-[var(--muted)] hover:text-white"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="max-h-[min(55vh,420px)] overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-10 text-center text-sm text-[var(--muted)]">Carregando catálogo de moedas...</p>
          ) : error ? (
            <p className="px-3 py-10 text-center text-sm text-[var(--muted)]">Não foi possível carregar os pares. Feche a busca e tente novamente.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-[var(--muted)]">Nenhuma moeda encontrada para “{query}”.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {results.map((coin) => (
                <button
                  key={coin.symbol}
                  type="button"
                  onClick={() => selectCoin(coin.symbol)}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)]"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-semibold text-[var(--foreground)]">
                      {coin.baseAsset}
                      <span className="text-xs text-[var(--muted)]">/{coin.quoteAsset}</span>
                    </span>
                    <p className="truncate text-xs text-[var(--muted)]">{coin.name}</p>
                  </div>
                  <span className="shrink-0 rounded bg-[#101823] px-2 py-0.5 font-mono text-[10px] text-[#718597]">
                    {coin.symbol}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!loading && !error && (
          <div className="flex items-center justify-between border-t border-[var(--border)] bg-[#101923] px-5 py-2.5 text-[11px] text-[var(--muted)]">
            <span>
              {query ? `${results.length} resultado${results.length === 1 ? "" : "s"} para “${query}”` : `${coins.length} pares spot disponíveis`}
            </span>
            <span className="font-mono text-[10px]">Pressione ENTER para selecionar o primeiro</span>
          </div>
        )}
      </section>
    </div>
  );
}
