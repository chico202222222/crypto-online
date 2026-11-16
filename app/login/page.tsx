"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { validateLoginForm, type LoginFormErrors } from "@/login/parsing";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    const result = validateLoginForm({ email, password, rememberMe, twoFactorCode });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      const data: { status?: string; message?: string } = await response.json();

      if (data.status === "require_2fa") {
        setShowTwoFactor(true);
        return;
      }
      if (!response.ok || data.status !== "success") {
        setServerError(data.message || "Não foi possível acessar. Tente novamente.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setServerError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "mt-2 w-full rounded-md border border-[var(--border)] bg-[#0c141b] px-3.5 py-3 text-sm text-[var(--foreground)] placeholder:text-[#72818c] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60";

  return (
    <div className="w-full">
      <section
        aria-labelledby="login-title"
        className="w-full bg-transparent p-0 sm:p-2 shadow-none border-0"
      >
        <h1 id="login-title" className="text-2xl font-bold tracking-tight text-white">
          {showTwoFactor ? "Verificação 2FA" : "Login"}
        </h1>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {showTwoFactor
            ? "Digite o código do aplicativo autenticador ou seu código exclusivo de acesso."
            : "Insira suas credenciais para continuar."}
        </p>

        {serverError && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-[#794b52] bg-[#3a242a] px-3 py-2 text-xs text-[#f3b5bd]"
          >
            {serverError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!showTwoFactor ? (
            <>
              <div>
                <label htmlFor="login-email" className="text-xs font-medium text-[var(--foreground)]">
                  E-mail
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  aria-invalid={Boolean(errors.email)}
                  className={inputClass}
                  placeholder="admin@cryptoonline.pro"
                />
                {errors.email && <p className="mt-1.5 text-xs text-[#f3b5bd]">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="login-password" className="text-xs font-medium text-[var(--foreground)]">
                  Senha
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading}
                  aria-invalid={Boolean(errors.password)}
                  className={inputClass}
                  placeholder="••••••••"
                />
                {errors.password && <p className="mt-1.5 text-xs text-[#f3b5bd]">{errors.password}</p>}
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 accent-[#c6a779]"
                />
                Manter sessão neste dispositivo
              </label>
            </>
          ) : (
            <div>
              <label htmlFor="login-code" className="text-xs font-medium text-[var(--foreground)]">
                Código de Autenticação (6 dígitos)
              </label>
              <input
                id="login-code"
                name="twoFactorCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                required
                pattern="[0-9]{6}"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, ""))}
                disabled={loading}
                aria-invalid={Boolean(errors.twoFactorCode)}
                className={`${inputClass} font-mono text-center tracking-[0.4em] text-lg font-bold text-amber-200`}
                placeholder="000000"
              />
              {errors.twoFactorCode && <p className="mt-1.5 text-xs text-[#f3b5bd]">{errors.twoFactorCode}</p>}

              <button
                type="button"
                onClick={() => {
                  setShowTwoFactor(false);
                  setTwoFactorCode("");
                  setServerError(null);
                }}
                className="mt-3 text-xs font-medium text-[var(--muted)] underline-offset-4 hover:text-white hover:underline"
              >
                &larr; Voltar para as credenciais
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#131a20] transition-colors hover:bg-[#dbc095] disabled:cursor-wait disabled:opacity-60 cursor-pointer shadow-md"
          >
            {loading ? "Verificando..." : showTwoFactor ? "Confirmar Código" : "Entrar"}
          </button>
        </form>

        <div className="mt-6 border-t border-[var(--border)] pt-4 text-center">
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">
            Seus dados são protegidos em conformidade com a LGPD (Lei nº 13.709/2018).
          </p>
        </div>
      </section>
    </div>
  );
}
