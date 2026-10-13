"use client";

import React, { memo } from "react";

interface LivePriceTrackerProps {
  isLive: boolean;
  onToggleLive: () => void;
  price?: number;
  priceChangeTone?: "up" | "down" | "neutral";
  lastTickTime?: Date | null;
  connectionType?: "websocket" | "polling" | "connecting" | "idle";
}

export const LivePriceTracker = memo(function LivePriceTracker({
  isLive,
  onToggleLive,
  lastTickTime,
  connectionType = "idle",
}: LivePriceTrackerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onToggleLive}
        aria-pressed={isLive}
        aria-label={isLive ? "Pausar acompanhamento em tempo real" : "Ativar acompanhamento em tempo real"}
        className={`group relative inline-flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${
          isLive
            ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.15)] hover:border-emerald-400 hover:bg-emerald-950/50"
            : "border-[var(--accent)]/40 bg-[var(--surface-raised)] text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-[#1a2938]"
        }`}
      >
        {/* Radar / Live indicator */}
        <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center" aria-hidden="true">
          {isLive ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 duration-1000" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            </>
          ) : (
            <span className="h-2 w-2 rounded-full bg-[var(--accent)] transition-transform group-hover:scale-125" />
          )}
        </span>

        <span className="font-medium tracking-tight">
          {isLive ? "Acompanhando em tempo real" : "Acompanhar em tempo real"}
        </span>

        {/* Live Badge */}
        {isLive ? (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/30">
            Ao Vivo
          </span>
        ) : (
          <span className="rounded bg-[var(--border)] px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wider text-[var(--muted)] group-hover:text-[var(--foreground)]">
            Stream
          </span>
        )}
      </button>

      {/* Status info chip when active */}
      {isLive && (
        <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[#0d151e] px-2.5 py-1.5 text-[11px] text-[var(--muted)]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connectionType === "websocket"
                ? "bg-emerald-400"
                : connectionType === "polling"
                ? "bg-amber-400"
                : "bg-blue-400 animate-pulse"
            }`}
            aria-hidden="true"
          />
          <span className="font-mono text-[10px]">
            {connectionType === "websocket"
              ? "WebSocket Binance"
              : connectionType === "polling"
              ? "Sincronização 3s"
              : "Conectando..."}
          </span>
          {lastTickTime && (
            <span className="text-[#64748b]">
              · {lastTickTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
