import type { Metadata } from "next";
import { MercuryLogo, MercuryWordmark } from "../components/MercuryLogo";

export const metadata: Metadata = {
  title: "Login | Mercury",
  description: "Acesso à plataforma Mercury.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="market-page flex min-h-screen flex-col justify-between px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto my-auto grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1fr_420px] lg:gap-20">
        <div className="max-w-md">
          <div className="mb-8">
            <MercuryLogo size="lg" />
          </div>
          <div className="hidden lg:block">
            <h2 className="text-[32px] font-semibold leading-[1.2] tracking-[-0.035em] text-white">
              Plataforma <MercuryWordmark />
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
