"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNavigation } from "./NavigationContext";
import { MenuIcon, SearchIcon } from "./icons";
import { MercuryLogo } from "./MercuryLogo";

export function Navbar() {
  const router = useRouter();
  const { isDrawerOpen, toggleDrawer, setIsSearchOpen } = useNavigation();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[#0b1117]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-9">
          <button
            type="button"
            onClick={toggleDrawer}
            aria-label={isDrawerOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={isDrawerOpen}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-white lg:hidden"
          >
            <MenuIcon className="h-[18px] w-[18px]" />
          </button>

          <MercuryLogo href="/" size="md" />

          <nav aria-label="Navegação principal" className="hidden h-16 items-center gap-1 lg:flex">
            <Link href="/" className="flex h-full items-center border-b-2 border-transparent px-3 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)] hover:text-white transition-colors">
              Mercado
            </Link>
            <Link href="/admin" className="flex h-full items-center border-b-2 border-transparent px-3 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)] hover:text-white transition-colors gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              Painel Admin
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            aria-label="Buscar par de negociação"
            className="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] px-2.5 text-xs text-[var(--muted)] transition-colors hover:border-[#536170] hover:text-white sm:min-w-44 sm:justify-between sm:px-3"
          >
            <span className="flex items-center gap-2"><SearchIcon className="h-4 w-4" /><span className="hidden sm:inline">Buscar par</span></span>
            <kbd className="hidden font-mono text-[10px] text-[#82919c] sm:inline">⌘ K</kbd>
          </button>
          <span className="hidden h-5 w-px bg-[var(--border)] sm:block" aria-hidden="true" />
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md px-2 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-white sm:px-3"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
