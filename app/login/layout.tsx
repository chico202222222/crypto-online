import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | CryptoOnline",
  description: "Acesso ao terminal CryptoOnline.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="market-page flex min-h-screen flex-col justify-between px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto my-auto grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1fr_420px] lg:gap-20">
        <div className="max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-end justify-center gap-[3px] rounded-md border border-[#685a45] bg-[#251f1a] pb-[7px]"
              aria-hidden="true"
            >
              <span className="h-2 w-[3px] rounded-[1px] bg-[var(--accent)]" />
              <span className="h-4 w-[3px] rounded-[1px] bg-[var(--accent)]" />
              <span className="h-3 w-[3px] rounded-[1px] bg-[var(--accent)]" />
            </span>
            <span className="text-xl font-bold tracking-tight text-white">
              Crypto<span className="text-[var(--accent)]">Online</span>
            </span>
          </div>
          <div className="hidden lg:block">
            <h2 className="text-[32px] font-semibold leading-[1.2] tracking-[-0.035em] text-white">
              Terminal de Mercado Cripto
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
              Acesso a livros de ordens spot, cotações em tempo real e análise técnica avançada.
            </p>
          </div>
        </div>
        {children}
      </div>

      <footer className="mt-12 w-full max-w-5xl mx-auto border-t border-[var(--border)] pt-6 text-center text-xs text-[var(--muted)]">
        <p className="leading-relaxed">
          Proteção de Dados &middot; Em conformidade com a LGPD (Lei Geral de Proteção de Dados - Lei nº 13.709/2018).
          Suas credenciais e dados de navegação são tratados com segurança e confidencialidade.
        </p>
      </footer>
    </main>
  );
}
