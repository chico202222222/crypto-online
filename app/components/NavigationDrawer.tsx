"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useNavigation } from "./NavigationContext";
import { CloseIcon, SearchIcon } from "./icons";

export function NavigationDrawer() {
  const { isDrawerOpen, setIsDrawerOpen, setIsSearchOpen } = useNavigation();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen]);

  if (!isDrawerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Fechar menu"
        className="absolute inset-0 h-full w-full bg-black/70"
        onClick={() => setIsDrawerOpen(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        className="relative flex h-full w-[min(86vw,320px)] flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--border)] px-5">
          <span className="text-sm font-semibold tracking-tight text-[var(--foreground)]">Crypto<span className="text-[var(--accent)]">Online</span></span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            aria-label="Fechar menu"
            className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-white"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Navegação móvel" className="space-y-2 p-5">
          <Link
            href="/"
            onClick={() => setIsDrawerOpen(false)}
            className="block rounded-md bg-[var(--surface-raised)] px-4 py-3 text-sm font-medium text-[var(--foreground)]"
          >
            Mercado
          </Link>
          <Link
            href="/admin"
            onClick={() => setIsDrawerOpen(false)}
            className="flex items-center gap-2 rounded-md bg-[var(--surface-raised)] px-4 py-3 text-sm font-medium text-[var(--foreground)]"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            Painel Admin
          </Link>
          <button
            type="button"
            onClick={() => {
              setIsDrawerOpen(false);
              setIsSearchOpen(true);
            }}
            className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-white"
          >
            <SearchIcon className="h-4 w-4" />
            Buscar par
          </button>
        </nav>
        <div className="mt-auto border-t border-[var(--border)] px-6 py-5 text-xs leading-5 text-[var(--muted)]">
          Cotações spot em USDT. Dados de mercado fornecidos pela Binance.
        </div>
      </aside>
    </div>
  );
}
