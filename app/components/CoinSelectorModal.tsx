"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COIN_CATEGORIES,
  type CoinCategory,
  type CoinMetadata,
} from "@/crypto_utils/coins";
import { CloseIcon, SearchIcon } from "./icons";

interface CoinSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  coins: CoinMetadata[];
  selectedSymbol: string;
  onSelectCoin: (symbol: string) => void;
}

export function CoinSelectorModal({
  isOpen,
  onClose,
  coins,
  selectedSymbol,
  onSelectCoin,
}: CoinSelectorModalProps) {
  const [activeCategory, setActiveCategory] = useState<CoinCategory>("top");
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => inputRef.current?.focus(), 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const filteredCoins = useMemo(() => {
    const term = search.trim().toUpperCase();

    return coins.filter((coin) => {
      // Filtro por termo digitado (ticker, baseAsset ou nome completo)
      const matchesSearch =
        !term ||
        coin.symbol.includes(term) ||
        coin.baseAsset.includes(term) ||
        coin.name.toUpperCase().includes(term);

      if (!matchesSearch) return false;

      // Filtro por categoria (se não for busca livre)
      if (term) return true; // Na busca com texto, busca em todo o catálogo
      if (activeCategory === "all") return true;
      if (activeCategory === "top") return coin.isPopular || coin.category === "top";
      return coin.category === activeCategory;
    });
  }, [coins, search, activeCategory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fechar explorador de moedas"
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coin-modal-title"
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0d141d] shadow-[0_25px_70px_rgba(0,0,0,0.85)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[#101923] px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--accent)]">
                Catálogo de Ativos
              </p>
            </div>
            <h2 id="coin-modal-title" className="mt-0.5 text-lg font-bold text-[var(--foreground)] sm:text-xl">
              Selecionar Moeda para Análise
            </h2>
            <p className="text-xs text-[var(--muted)]">
              {coins.length > 0 ? `${coins.length} pares Spot em USDT disponíveis na Binance` : "Carregando catálogo..."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="rounded-lg border border-[var(--border)] p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="border-b border-[var(--border)] bg-[#0b1017] p-4 sm:px-6">
          <div className="relative flex items-center">
            <SearchIcon className="pointer-events-none absolute left-3.5 h-4 w-4 text-[var(--muted)]" />
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquise por nome ou ticker (ex: Bitcoin, SOL, PEPE, SUI, Aave...)"
              className="w-full rounded-xl border border-[var(--border)] bg-[#131d28] py-2.5 pl-10 pr-10 text-sm text-[var(--foreground)] placeholder:text-[#5d7182] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 text-xs text-[var(--muted)] hover:text-white"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Categories Filter Tabs */}
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none" role="tablist">
            {COIN_CATEGORIES.map((cat) => {
              const isSelected = activeCategory === cat.id && !search;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setSearch("");
                  }}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                    isSelected
                      ? "border border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                      : "border border-[var(--border)]/70 bg-[#121c27] text-[var(--muted)] hover:border-[#405364] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Results Counter / Category Description */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[#0f1722] px-6 py-2 font-mono text-[11px] text-[var(--muted)]">
          <span>
            {search
              ? `Resultados para “${search}”: ${filteredCoins.length} moedas encontradas`
              : COIN_CATEGORIES.find((c) => c.id === activeCategory)?.description || "Catálogo de moedas"}
          </span>
          <span className="shrink-0">{filteredCoins.length} moedas</span>
        </div>

        {/* Coins Grid / List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {filteredCoins.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <span className="text-3xl">🔍</span>
              <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
                Nenhuma moeda encontrada para “{search}”
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Tente buscar pelo código da moeda ou selecione a aba &ldquo;Todas&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setActiveCategory("all");
                }}
                className="mt-4 rounded-lg bg-[var(--surface-raised)] px-4 py-2 text-xs font-semibold text-[var(--accent)] hover:opacity-90"
              >
                Ver todas as moedas
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
              {filteredCoins.map((coin) => {
                const isSelected = selectedSymbol === coin.symbol;
                return (
                  <button
                    key={coin.symbol}
                    type="button"
                    onClick={() => {
                      onSelectCoin(coin.symbol);
                      onClose();
                    }}
                    className={`group relative flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_15px_rgba(230,175,46,0.12)]"
                        : "border-[var(--border)] bg-[#101924] hover:border-[#4d6377] hover:bg-[#14202d]"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-mono text-sm font-bold tracking-tight text-[var(--foreground)] group-hover:text-[var(--accent)]">
                        {coin.baseAsset}
                      </span>
                      {isSelected ? (
                        <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-[#0b1117]">
                          Ativo
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-[var(--muted)]">
                          /USDT
                        </span>
                      )}
                    </div>

                    <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)] group-hover:text-[#ccd6df]">
                      {coin.name}
                    </p>

                    <div className="mt-2.5 flex w-full items-center justify-between">
                      <span className="rounded bg-[#0d141d] px-1.5 py-0.5 font-mono text-[9px] text-[#788e9f]">
                        Spot
                      </span>
                      <span className="font-mono text-[9px] text-[#55697a]">
                        {coin.symbol}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between border-t border-[var(--border)] bg-[#101923] px-5 py-3 text-xs text-[var(--muted)] sm:px-6">
          <span className="font-mono text-[11px]">
            {selectedSymbol ? `Ativo atual: ${selectedSymbol}` : "Nenhum ativo selecionado"}
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[10px] sm:inline">Pressione ESC para fechar</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-[var(--surface-raised)] px-3.5 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[#202f3e]"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
