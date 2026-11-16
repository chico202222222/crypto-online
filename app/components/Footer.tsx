export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[#0a1015] px-4 py-6 text-xs text-[var(--muted)] sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-medium text-[var(--foreground)]">Crypto<span className="text-[var(--accent)]">Online</span></span>
        <p>Cotações para acompanhamento de mercado. Dados fornecidos pela Binance.</p>
      </div>
    </footer>
  );
}
