"use client";

import { useState, useSyncExternalStore } from "react";
import { COOKIE_CONSENT_NAME } from "@/crypto_utils/session-cookies";

function checkHasConsent(): boolean {
  if (typeof document === "undefined") return true;
  return document.cookie.split("; ").some((item) => item.startsWith(`${COOKIE_CONSENT_NAME}=`));
}

export function CookieConsentBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Lê consentimento de forma síncrona sem efeitos colaterais
  const hasConsent = useSyncExternalStore(
    () => () => {},
    checkHasConsent,
    () => true
  );

  const handleAccept = () => {
    const oneYear = 365 * 24 * 60 * 60;
    const isProd = process.env.NODE_ENV === "production";
    document.cookie = `${COOKIE_CONSENT_NAME}=accepted; path=/; max-age=${oneYear}; SameSite=Lax${
      isProd ? "; Secure" : ""
    }`;
    setDismissed(true);
  };

  if (hasConsent || dismissed) return null;

  return (
    <aside
      aria-label="Aviso de Cookies e Privacidade"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-4xl animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="rounded-xl border border-[#2b3a4a] bg-[#0c141d]/95 p-4 shadow-2xl backdrop-blur-md sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5 text-xs text-[var(--muted)]">
            <div className="flex items-center gap-2">
              <span className="text-base" role="img" aria-label="Cookie">
                🍪
              </span>
              <p className="font-semibold text-white">Uso de Cookies de Sessão & LGPD</p>
            </div>
            <p className="leading-relaxed">
              Utilizamos <strong className="text-white">cookies estritamente necessários</strong> para
              autenticar sua identidade, proteger seus dados contra ataques CSRF e manter sua sessão
              ativa no terminal Mercury, em conformidade com a Lei nº 13.709/2018 (LGPD).
            </p>
            {showDetails && (
              <div className="mt-3 rounded-lg border border-[var(--border)] bg-[#070b0f] p-3 text-[11px] text-[#9bb0c1] space-y-2">
                <p>
                  <strong className="text-amber-200">mercury_session / __session:</strong> Token
                  criptografado com HMAC-SHA256, armazenado com flag HttpOnly para máxima proteção.
                </p>
                <p>
                  <strong className="text-amber-200">mercury_user / mercury_session_active:</strong>{" "}
                  Armazena dados não sensíveis de exibição e controle do tempo de sessão no navegador.
                </p>
                <p className="text-[10px] text-[#6b7c8d]">
                  Não utilizamos cookies invasivos de publicidade ou rastreamento de terceiros.
                </p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:self-center">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-white"
            >
              {showDetails ? "Ocultar Detalhes" : "Ver Detalhes"}
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[#131a20] transition-colors hover:bg-[#dbc095] shadow-sm"
            >
              Concordar e Prosseguir
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
