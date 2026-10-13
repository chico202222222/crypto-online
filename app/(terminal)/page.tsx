import { CryptoChartPanel } from "../components/CryptoChartPanel";
import { MercuryWordmark } from "../components/MercuryLogo";

export default function Home() {
  return (
    <main className="market-page flex-1 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-9 flex flex-col gap-7 border-b border-[var(--border)] pb-9 sm:mb-11 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.16em] text-[var(--accent)]">
              <span className="h-px w-6 bg-[var(--accent)]" aria-hidden="true" />
              <span>
                <MercuryWordmark /> · Wyckoff
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-[42px] sm:leading-[1.1]">
              Estrutura do mercado
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-[15px]">
              Analise acumulação e distribuição com preço, volume, suporte, resistência e fases marcadas sobre candles reais.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 border-l-2 border-[var(--accent)] pl-4 text-xs text-[var(--muted)]">
            <div>
              <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">
                Método
              </span>
              <span className="mt-1 block text-[var(--foreground)]">Wyckoff · Spot</span>
            </div>
          </div>
        </div>

        <CryptoChartPanel />
      </div>
    </main>
  );
}
