export function MarketTicker() {
  return (
    <div className="border-b border-[var(--border)] bg-[#101922] px-4 py-2 text-[10px] font-medium uppercase tracking-[0.14em] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-[var(--accent)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
          Mercado spot
        </div>
        <span className="truncate text-[#9babb8]">Pares em USDT <span className="px-1.5 text-[#536473]">/</span> Dados Binance</span>
      </div>
    </div>
  );
}
