"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNavigation } from "./NavigationContext";
import { CloseIcon, SearchIcon } from "./icons";

type Coin = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
};

export function QuickSearchModal() {
  const { isSearchOpen, setIsSearchOpen } = useNavigation();

  if (!isSearchOpen) return null;
  return <QuickSearchDialog onClose={() => setIsSearchOpen(false)} />;
}

function QuickSearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [coins, setCoins] = useState<Coin[]>([]);
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
      .then((data: { status: string; coins: Coin[] }) => {
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
      .filter((coin) => coin.symbol.includes(term) || coin.baseAsset.includes(term))
      .slice(0, 40);
  }, [coins, query]);

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
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh] sm:pt-[15vh]">
      <button type="button" aria-label="Fechar busca" className="absolute inset-0 h-full w-full bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="search-title" className="relative w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,.5)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 id="search-title" className="text-sm font-semibold text-[var(--foreground)]">Buscar par de negociação</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Mercado spot em USDT</p>
          </div>
          <button type="button" aria-label="Fechar busca" onClick={onClose} className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-white">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <SearchIcon className="h-5 w-5 shrink-0 text-[var(--accent)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results.length > 0) selectCoin(results[0].symbol);
            }}
            aria-label="Símbolo do ativo"
            placeholder="Ex.: BTC, ETH, ADA"
            className="w-full bg-transparent text-sm text-[var(--foreground)] placeholder:text-[#758693] focus:outline-none"
          />
          <kbd className="hidden font-mono text-[10px] text-[var(--muted)] sm:block">ESC</kbd>
        </div>
        <div className="max-h-[min(50vh,380px)] overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">Carregando pares disponíveis...</p>
          ) : error ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">Não foi possível carregar os pares. Feche a busca e tente novamente.</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">Nenhum par encontrado para “{query}”.</p>
          ) : (
            results.map((coin) => (
              <button
                key={coin.symbol}
                type="button"
                onClick={() => selectCoin(coin.symbol)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-raised)] focus-visible:bg-[var(--surface-raised)]"
              >
                <span className="font-mono text-sm font-medium text-[var(--foreground)]">{coin.baseAsset}<span className="text-[var(--muted)]">/{coin.quoteAsset}</span></span>
                <span className="font-mono text-[11px] text-[var(--muted)]">{coin.symbol}</span>
              </button>
            ))
          )}
        </div>
        {!loading && !error && (
          <div className="border-t border-[var(--border)] px-5 py-2.5 text-[11px] text-[var(--muted)]">
            {query ? `${results.length} resultado${results.length === 1 ? "" : "s"} exibido${results.length === 1 ? "" : "s"}` : `${coins.length} pares disponíveis`}
          </div>
        )}
      </section>
    </div>
  );
}
