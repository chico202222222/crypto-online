"use client";

import { useEffect, useState, useCallback } from "react";

interface EndpointHealth {
  name: string;
  path: string;
  target: string;
  status: "up" | "down";
  httpCode: number | null;
  latencyMs: number;
  dataSnippet?: string;
}

interface CrowNode {
  port: number;
  status: "online" | "offline";
  latencyMs: number;
  httpCode: number | null;
}

interface SystemStatus {
  status: string;
  user: {
    email: string;
    role: "administrador" | "mestre" | "aprendiz";
  };
  crow: {
    node1: CrowNode;
    node2: CrowNode;
  };
  endpoints: EndpointHealth[];
  upstream: {
    binanceVision: {
      status: string;
      latencyMs: number;
      httpCode: number;
    };
  };
  security: {
    cors: {
      status: string;
      allowedOrigin: string;
      preflightSupported: boolean;
      methods: string;
      details: string;
    };
    middleware: {
      status: string;
      type: string;
      tokenAlgorithm: string;
      cookieFlags: string;
    };
    sanitization: {
      schemaValidation: string;
      passwordHashing: string;
      timingSafeProtection: string;
      twoFactorStandard: string;
    };
  };
  server: {
    uptimeSeconds: number;
    memoryRssMb: number;
    nodeVersion: string;
    timestamp: string;
  };
}

interface UserRecord {
  id: number;
  email: string;
  role: "administrador" | "mestre" | "aprendiz";
  twoFactorEnabled: boolean;
  createdAt: string;
}

interface MockAccount {
  email: string;
  role: "administrador" | "mestre" | "aprendiz";
  totpCode: string;
  testPassword: string;
}

export default function AdminPage() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [mockAccounts, setMockAccounts] = useState<MockAccount[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [crowActionLoading, setCrowActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "tester" | "security">("overview");

  // API Tester state
  const [testEndpoint, setTestEndpoint] = useState("/api/value?coin=BTCUSDT");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testLatency, setTestLatency] = useState<number | null>(null);

  // Copied TOTP notification
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchStatus = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/status", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success") {
          setData(json);
        }
      }
    } catch (err) {
      console.error("Erro ao obter status da API:", err);
    } finally {
      if (isManual) setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success") {
          setUsers(json.users || []);
        }
      }
    } catch (err) {
      console.error("Erro ao listar usuários:", err);
    }
  }, []);

  const fetchMockAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/mock-authenticator", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "success" && json.mockAuthenticator) {
          setMockAccounts(json.mockAuthenticator.accounts || []);
          setSecondsRemaining(json.mockAuthenticator.secondsRemaining || 30);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const [statusRes, usersRes, mockRes] = await Promise.all([
          fetch("/api/admin/status", { cache: "no-store" }),
          fetch("/api/admin/users", { cache: "no-store" }),
          fetch("/api/auth/mock-authenticator", { cache: "no-store" }),
        ]);

        if (!ignore) {
          if (statusRes.ok) {
            const json = await statusRes.json();
            if (json.status === "success") setData(json);
          }
          if (usersRes.ok) {
            const json = await usersRes.json();
            if (json.status === "success") setUsers(json.users || []);
          }
          if (mockRes.ok) {
            const json = await mockRes.json();
            if (json.status === "success" && json.mockAuthenticator) {
              setMockAccounts(json.mockAuthenticator.accounts || []);
              setSecondsRemaining(json.mockAuthenticator.secondsRemaining || 30);
            }
          }
          setLoading(false);
        }
      } catch {
        if (!ignore) setLoading(false);
      }
    }
    init();

    const interval = setInterval(() => {
      fetchStatus(false);
    }, 10000);

    const totpInterval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          fetchMockAuth();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      ignore = true;
      clearInterval(interval);
      clearInterval(totpInterval);
    };
  }, [fetchStatus, fetchMockAuth]);

  const handleRoleChange = async (email: string, newRole: "administrador" | "mestre" | "aprendiz") => {
    try {
      setActionMessage(null);
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: newRole }),
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setActionMessage({ text: json.message, type: "success" });
        fetchUsers();
      } else {
        setActionMessage({ text: json.message || "Erro ao atualizar permissão.", type: "error" });
      }
    } catch {
      setActionMessage({ text: "Erro na conexão com o servidor.", type: "error" });
    }
  };

  const handleCrowControl = async (action: "start" | "restart" | "stop") => {
    try {
      setCrowActionLoading(true);
      setActionMessage(null);
      const res = await fetch("/api/admin/crow-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, port: 18080 }),
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setActionMessage({ text: json.message, type: "success" });
        setTimeout(() => fetchStatus(), 1000);
      } else {
        setActionMessage({ text: json.message || "Falha ao executar ação no Crow.", type: "error" });
      }
    } catch {
      setActionMessage({ text: "Falha de rede ao comandar o Crow.", type: "error" });
    } finally {
      setCrowActionLoading(false);
    }
  };

  const handleRunEndpointTest = async () => {
    try {
      setTestRunning(true);
      setTestResult(null);
      const start = performance.now();
      const targetUrl = `http://127.0.0.1:18080${testEndpoint}`;
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(4000) });
      const lat = Math.round(performance.now() - start);
      setTestLatency(lat);
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        setTestResult(JSON.stringify(parsed, null, 2));
      } catch {
        setTestResult(text);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult("Erro ao consultar endpoint: " + msg);
      setTestLatency(null);
    } finally {
      setTestRunning(false);
    }
  };

  const getRoleStyle = (role: string) => {
    switch (role) {
      case "administrador":
        return "border-[#9d7cf0]/40 bg-[#2b2144]/90 text-[#d8caff]";
      case "mestre":
        return "border-[#38bdf8]/40 bg-[#162e45]/90 text-[#a5e5ff]";
      case "aprendiz":
        return "border-[#34d399]/40 bg-[#16382c]/90 text-[#9bf4d5]";
      default:
        return "border-gray-700 bg-gray-800 text-gray-300";
    }
  };

  const isCurrentAdmin = data?.user?.role === "administrador";

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className="text-sm text-[var(--muted)]">Carregando métricas e permissões do sistema...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header do Painel */}
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
              aria-hidden="true"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400">
              CryptoOnline Admin &middot; Monitor da API
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Monitor de Operação Crow C++
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Acompanhamento em tempo real de microsserviços, integridade de rotas, banco SQLite e segurança.
          </p>
        </div>

        {/* Badge do Usuário Logado & Ações */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[#111922] px-3.5 py-2">
            <div className="text-right">
              <p className="truncate text-xs font-medium text-white max-w-[180px]">{data?.user?.email}</p>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className="text-[10px] text-[var(--muted)]">Nível:</span>
                <span
                  className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border ${getRoleStyle(
                    data?.user?.role || "aprendiz"
                  )}`}
                >
                  {data?.user?.role}
                </span>
              </div>
            </div>
            <span className="h-7 w-px bg-[var(--border)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" title="Sessão ativa" />
          </div>

          <button
            type="button"
            onClick={fetchStatus}
            disabled={refreshing}
            className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] bg-[#16222f] px-3.5 text-xs font-medium text-white transition-colors hover:border-[#425870] hover:bg-[#1f3042] disabled:opacity-50 cursor-pointer"
          >
            <svg
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-amber-400" : "text-[var(--muted)]"}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span>{refreshing ? "Atualizando..." : "Atualizar"}</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback de Ações */}
      {actionMessage && (
        <div
          role="alert"
          className={`mt-4 flex items-center justify-between rounded-lg border px-4 py-3 text-xs font-medium ${
            actionMessage.type === "success"
              ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-200"
              : "border-red-500/40 bg-red-950/60 text-red-200"
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="ml-3 text-xs underline opacity-80 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Tabs de Navegação */}
      <div className="mt-6 flex overflow-x-auto border-b border-[var(--border)] text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === "overview"
              ? "border-[var(--accent)] text-white font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-white"
          }`}
        >
          <span>Visão Geral & Crow</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === "users"
              ? "border-[var(--accent)] text-white font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-white"
          }`}
        >
          <span>Permissões no DB ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tester")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === "tester"
              ? "border-[var(--accent)] text-white font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-white"
          }`}
        >
          <span>Testador de Endpoints</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === "security"
              ? "border-[var(--accent)] text-white font-semibold"
              : "border-transparent text-[var(--muted)] hover:text-white"
          }`}
        >
          <span>Auditoria CORS & Middleware</span>
        </button>
      </div>

      {/* TAB 1: VISÃO GERAL & CROW */}
      {activeTab === "overview" && (
        <div className="mt-6 space-y-6">
          {/* Cartões de Status em Destaque */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Crow Node 1 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--muted)]">Crow C++ Node 1 (:18080)</span>
                <span
                  className={`flex h-2.5 w-2.5 rounded-full ${
                    data?.crow.node1.status === "online" ? "bg-emerald-400 animate-pulse" : "bg-red-500"
                  }`}
                />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold uppercase tracking-tight text-white">
                  {data?.crow.node1.status}
                </span>
                <span className="font-mono text-xs text-[var(--accent)]">
                  {data?.crow.node1.latencyMs ? `${data.crow.node1.latencyMs} ms` : "-"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Porta primária do microserviço</p>
            </div>

            {/* Crow Node 2 */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--muted)]">Crow C++ Node 2 (:18081)</span>
                <span
                  className={`flex h-2.5 w-2.5 rounded-full ${
                    data?.crow.node2.status === "online" ? "bg-emerald-400" : "bg-zinc-600"
                  }`}
                />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold uppercase tracking-tight text-white">
                  {data?.crow.node2.status}
                </span>
                <span className="font-mono text-xs text-[var(--accent)]">
                  {data?.crow.node2.latencyMs ? `${data.crow.node2.latencyMs} ms` : "inativo"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Nó secundário / réplica balanceada</p>
            </div>

            {/* Binance Upstream */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--muted)]">Binance Vision API</span>
                <span
                  className={`flex h-2.5 w-2.5 rounded-full ${
                    data?.upstream.binanceVision.status === "online" ? "bg-emerald-400" : "bg-red-500"
                  }`}
                />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold uppercase tracking-tight text-white">
                  {data?.upstream.binanceVision.status}
                </span>
                <span className="font-mono text-xs text-[var(--accent)]">
                  {data?.upstream.binanceVision.latencyMs ? `${data.upstream.binanceVision.latencyMs} ms` : "-"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Upstream de cotações e candles</p>
            </div>

            {/* Servidor Next.js & Memória */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--muted)]">Servidor & Memória</span>
                <span className="flex h-2.5 w-2.5 rounded-full bg-blue-400" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold uppercase tracking-tight text-white">
                  {data?.server.memoryRssMb} MB
                </span>
                <span className="font-mono text-xs text-[var(--accent)]">
                  {data?.server.uptimeSeconds ? `${data.server.uptimeSeconds}s up` : "-"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">Node {data?.server.nodeVersion}</p>
            </div>
          </div>

          {/* Painel de Controle de Processo Crow */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Controle Operacional do Crow C++</h2>
                <p className="text-xs text-[var(--muted)]">
                  Gerencie a execução do binário C++ nativo compilado (requer permissão de{" "}
                  <strong className="text-purple-300">administrador</strong>).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCrowControl("start")}
                  disabled={!isCurrentAdmin || crowActionLoading}
                  className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 cursor-pointer"
                  title={!isCurrentAdmin ? "Apenas administrador pode iniciar processos" : ""}
                >
                  Iniciar Crow (:18080)
                </button>

                <button
                  type="button"
                  onClick={() => handleCrowControl("restart")}
                  disabled={!isCurrentAdmin || crowActionLoading}
                  className="rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-40 cursor-pointer"
                  title={!isCurrentAdmin ? "Apenas administrador pode reiniciar processos" : ""}
                >
                  Reiniciar Crow
                </button>

                <button
                  type="button"
                  onClick={() => handleCrowControl("stop")}
                  disabled={!isCurrentAdmin || crowActionLoading}
                  className="rounded-lg bg-red-800 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40 cursor-pointer"
                  title={!isCurrentAdmin ? "Apenas administrador pode parar processos" : ""}
                >
                  Parar Crow
                </button>
              </div>
            </div>

            {!isCurrentAdmin && (
              <p className="mt-3 text-[11px] text-amber-300/80 bg-amber-950/40 border border-amber-800/40 rounded-md p-2">
                Seu perfil atual é <strong>{data?.user?.role}</strong>. Você tem permissão de visualização e teste,
                mas alterações no ciclo de vida do processo estão restritas ao nível <strong>administrador</strong>.
              </p>
            )}
          </div>

          {/* Matriz de Saúde dos Endpoints */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-white">Matriz de Saúde dos Endpoints do Microserviço</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Verificação periódica de disponibilidade, código HTTP e tempo de resposta de cada rota do Crow.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="pb-3 font-semibold">ENDPOINT / ROTA</th>
                    <th className="pb-3 font-semibold">ALVO</th>
                    <th className="pb-3 font-semibold">STATUS</th>
                    <th className="pb-3 font-semibold">CÓDIGO HTTP</th>
                    <th className="pb-3 font-semibold">LATÊNCIA</th>
                    <th className="pb-3 font-semibold">AMOSTRA DE DADOS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/60">
                  {data?.endpoints.map((ep) => (
                    <tr key={ep.path} className="hover:bg-[#131b24]/50">
                      <td className="py-3 font-medium text-white">
                        <div>{ep.name}</div>
                        <code className="text-[11px] text-[var(--accent)] font-mono">{ep.path}</code>
                      </td>
                      <td className="py-3 text-[var(--muted)]">{ep.target}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            ep.status === "up"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              ep.status === "up" ? "bg-emerald-400" : "bg-red-400"
                            }`}
                          />
                          {ep.status === "up" ? "ONLINE" : "OFFLINE"}
                        </span>
                      </td>
                      <td className="py-3 font-mono font-semibold">
                        {ep.httpCode ? (
                          <span className={ep.httpCode === 200 ? "text-emerald-400" : "text-amber-400"}>
                            {ep.httpCode}
                          </span>
                        ) : (
                          <span className="text-zinc-600">-</span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-[var(--muted)]">
                        {ep.status === "up" ? `${ep.latencyMs} ms` : "-"}
                      </td>
                      <td className="py-3 font-mono text-[10px] text-[var(--muted)] max-w-xs truncate">
                        {ep.dataSnippet || "Nenhum dado retornado"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GERENCIAMENTO DE PERMISSÕES NO DB */}
      {activeTab === "users" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Controle de Permissões de Usuários no Banco SQLite (`users.db`)
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  O sistema possui 3 níveis de permissões:{" "}
                  <strong className="text-purple-300">administrador</strong> (acesso total),{" "}
                  <strong className="text-sky-300">mestre</strong> (diagnóstico avançado) e{" "}
                  <strong className="text-emerald-300">aprendiz</strong> (monitoramento básico).
                </p>
              </div>
              <button
                type="button"
                onClick={fetchUsers}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Recarregar usuários
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="pb-3 font-semibold">ID</th>
                    <th className="pb-3 font-semibold">E-MAIL</th>
                    <th className="pb-3 font-semibold">PERMISSÃO ATUAL</th>
                    <th className="pb-3 font-semibold">2FA TOTP</th>
                    <th className="pb-3 font-semibold">CRIADO EM</th>
                    <th className="pb-3 font-semibold text-right">ALTERAR PERMISSÃO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#131b24]/50">
                      <td className="py-3.5 font-mono text-[var(--muted)]">{u.id}</td>
                      <td className="py-3.5 font-medium text-white">{u.email}</td>
                      <td className="py-3.5">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${getRoleStyle(
                            u.role
                          )}`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            u.twoFactorEnabled
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-300 border border-red-500/20"
                          }`}
                        >
                          {u.twoFactorEnabled ? "Ativado" : "Desativado"}
                        </span>
                      </td>
                      <td className="py-3.5 font-mono text-[11px] text-[var(--muted)]">{u.createdAt}</td>
                      <td className="py-3.5 text-right">
                        {isCurrentAdmin ? (
                          <select
                            value={u.role}
                            onChange={(e) =>
                              handleRoleChange(
                                u.email,
                                e.target.value as "administrador" | "mestre" | "aprendiz"
                              )
                            }
                            className="rounded border border-[var(--border)] bg-[#0d1620] px-2.5 py-1 text-xs text-white focus:border-[var(--accent)] focus:outline-none cursor-pointer"
                          >
                            <option value="administrador">administrador (Total)</option>
                            <option value="mestre">mestre (Diagnóstico)</option>
                            <option value="aprendiz">aprendiz (Visualização)</option>
                          </select>
                        ) : (
                          <span className="text-[11px] text-[var(--muted)] italic">Apenas administrador</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 rounded-lg border border-[#2b3a4a] bg-[#0c141d] p-4 text-xs">
              <h3 className="font-semibold text-white">Hierarquia e Privilégios das Permissões:</h3>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded border border-[#9d7cf0]/30 bg-[#1e1730] p-3">
                  <p className="font-bold text-[#c8b5ff]">administrador</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Controle de processos Crow (Start/Restart/Stop), alteração de permissões no SQLite, teste de
                    endpoints e visualização completa.
                  </p>
                </div>
                <div className="rounded border border-[#38bdf8]/30 bg-[#122233] p-3">
                  <p className="font-bold text-[#7dd3fc]">mestre</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Execução do testador de API, diagnóstico de latência em tempo real, monitoramento de saúde e
                    leitura de logs operacionais.
                  </p>
                </div>
                <div className="rounded border border-[#34d399]/30 bg-[#11261e] p-3">
                  <p className="font-bold text-[#6ee7b7]">aprendiz</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Modo monitor de aprendizado: visualização de status online/offline, métricas de mercado e
                    leitura de indicadores sem ações de escrita.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TESTADOR DE ENDPOINTS */}
      {activeTab === "tester" && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-white">Console Interativo de Diagnóstico da API Crow</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Envie requisições diretas para a porta local do microserviço Crow C++ e inspecione o JSON bruto e a
              latência da resposta.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <div className="flex-1 flex gap-2">
                <span className="flex items-center rounded-l-md border border-r-0 border-[var(--border)] bg-[#0d1620] px-3 font-mono text-xs text-[var(--muted)]">
                  GET http://127.0.0.1:18080
                </span>
                <input
                  type="text"
                  value={testEndpoint}
                  onChange={(e) => setTestEndpoint(e.target.value)}
                  placeholder="/api/value?coin=BTCUSDT"
                  className="flex-1 rounded-r-md border border-[var(--border)] bg-[#070d12] px-3 py-2 text-xs font-mono text-white focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTestEndpoint("/api/value?coin=BTCUSDT")}
                  className="rounded border border-[var(--border)] bg-[#111922] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:text-white"
                >
                  Value BTC
                </button>
                <button
                  type="button"
                  onClick={() => setTestEndpoint("/api/btc?coin=BTCUSDT")}
                  className="rounded border border-[var(--border)] bg-[#111922] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:text-white"
                >
                  Direct BTC
                </button>
                <button
                  type="button"
                  onClick={() => setTestEndpoint("/health")}
                  className="rounded border border-[var(--border)] bg-[#111922] px-2.5 py-1.5 text-[11px] text-[var(--muted)] hover:text-white"
                >
                  Health
                </button>
              </div>

              <button
                type="button"
                onClick={handleRunEndpointTest}
                disabled={testRunning}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[#11161d] transition-colors hover:bg-[#dbc095] disabled:opacity-50 cursor-pointer"
              >
                {testRunning ? "Disparando..." : "Testar Rota"}
              </button>
            </div>

            {testLatency !== null && (
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="text-[var(--muted)]">Tempo de resposta:</span>
                <span className="font-mono font-bold text-emerald-400">{testLatency} ms</span>
              </div>
            )}

            {testResult && (
              <div className="mt-4">
                <div className="flex items-center justify-between border-b border-[var(--border)] bg-[#0c1218] px-3 py-1.5 rounded-t-md text-[11px] text-[var(--muted)]">
                  <span>RESPOSTA DO MICROSSERVIÇO</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(testResult);
                      setCopiedCode("payload");
                      setTimeout(() => setCopiedCode(null), 2000);
                    }}
                    className="hover:text-white"
                  >
                    {copiedCode === "payload" ? "Copiado" : "Copiar JSON"}
                  </button>
                </div>
                <pre className="max-h-96 overflow-auto rounded-b-md border border-[var(--border)] bg-[#060a0e] p-3 font-mono text-[11px] text-emerald-300">
                  {testResult}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AUDITORIA CORS & MIDDLEWARE */}
      {activeTab === "security" && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* CORS Health */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-white">Saúde do CORS (Cross-Origin Resource Sharing)</h2>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                O CORS protege contra requisições não autorizadas disparadas de navegadores ou domínios externos.
              </p>

              <div className="mt-4 space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Status do CORS:</span>
                  <span className="text-emerald-400 font-bold uppercase">{data?.security.cors.status}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Origem Permitida (Crow):</span>
                  <span className="text-white">{data?.security.cors.allowedOrigin}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Preflight OPTIONS:</span>
                  <span className="text-emerald-400">Suportado (HTTP 204)</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Origens Estranhas:</span>
                  <span className="text-red-400 font-bold">Bloqueadas (HTTP 403)</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Métodos Liberados:</span>
                  <span className="text-white">{data?.security.cors.methods}</span>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-[#0e1620] p-3 text-[11px] text-[var(--muted)]">
                <strong className="text-white">Implementação:</strong> Middleware <code>CorsPreflight</code> em C++ no
                Crow compara <code>req.get_header_value(&quot;Origin&quot;)</code> contra <code>allowedOrigin</code> antes de
                processar preflights.
              </div>
            </div>

            {/* Middleware / Proxy Health */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-white">Saúde do Middleware / Proxy (Next.js 16)</h2>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                O arquivo <code>proxy.ts</code> intercepta todas as rotas protegidas no edge antes de alcançar a aplicação.
              </p>

              <div className="mt-4 space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Componente de Intercepção:</span>
                  <span className="text-white">{data?.security.middleware.type}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Assinatura de Sessão:</span>
                  <span className="text-emerald-400 font-bold">{data?.security.middleware.tokenAlgorithm}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Flags do Cookie de Sessão:</span>
                  <span className="text-white">{data?.security.middleware.cookieFlags}</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Expiração Máxima:</span>
                  <span className="text-white">24h normal / 7 dias persistente</span>
                </div>
                <div className="flex justify-between border-b border-[var(--border)] pb-2">
                  <span className="text-[var(--muted)]">Rotas Públicas:</span>
                  <span className="text-white">/login, /api/auth/login, /api/auth/mock-authenticator</span>
                </div>
              </div>

              <div className="mt-4 rounded-lg bg-[#0e1620] p-3 text-[11px] text-[var(--muted)]">
                <strong className="text-white">Proteção Ativa:</strong> Qualquer tentativa de acessar <code>/admin</code>{" "}
                ou APIs internas sem token válido com assinatura HMAC válida é rejeitada com 401 ou redirecionada para{" "}
                <code>/login</code>.
              </div>
            </div>
          </div>

          {/* Validação e Sanitização de Credenciais */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-sm font-semibold text-white">Validação & Sanitização de Credenciais</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Verificações de integridade aplicadas a senhas, payloads e códigos de dois fatores.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div className="rounded-lg border border-[var(--border)] bg-[#0d1620] p-3">
                <p className="text-[var(--muted)] text-[10px] font-semibold uppercase">Validação de Formulários</p>
                <p className="mt-1 font-bold text-white">{data?.security.sanitization.schemaValidation}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">E-mail sanitizado e aparado; senha min 8 chars.</p>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[#0d1620] p-3">
                <p className="text-[var(--muted)] text-[10px] font-semibold uppercase">Criptografia de Senhas</p>
                <p className="mt-1 font-bold text-white">{data?.security.sanitization.passwordHashing}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Salt individual aleatório de 16 bytes.</p>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[#0d1620] p-3">
                <p className="text-[var(--muted)] text-[10px] font-semibold uppercase">Proteção Anti-Timing</p>
                <p className="mt-1 font-bold text-emerald-400">{data?.security.sanitization.timingSafeProtection}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Imunidade a ataques de temporização (timing attacks).</p>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[#0d1620] p-3">
                <p className="text-[var(--muted)] text-[10px] font-semibold uppercase">Autenticação 2FA</p>
                <p className="mt-1 font-bold text-white">{data?.security.sanitization.twoFactorStandard}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">Base32 TOTP individual com verificação segura.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Widget Flutuante / Fixo do Mock Authenticator */}
      <div className="mt-8 rounded-xl border border-[var(--border)] bg-[#091017] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
            <h3 className="font-semibold text-white text-xs">
              Autenticador de Testes (Suporte & Manutenção)
            </h3>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-[var(--muted)]">
            <span>Janela TOTP:</span>
            <span className="font-bold text-amber-400">{secondsRemaining}s</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {mockAccounts.map((acc) => (
            <div
              key={acc.email}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[#0e1722] p-2.5"
            >
              <div>
                <span
                  className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider border ${getRoleStyle(
                    acc.role
                  )}`}
                >
                  {acc.role}
                </span>
                <p className="truncate text-xs font-medium text-white max-w-[150px] mt-0.5">{acc.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-300 bg-[#060b10] px-2 py-1 rounded border border-[#1b2734]">
                  {acc.totpCode}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(acc.totpCode);
                    setCopiedCode(acc.email);
                    setTimeout(() => setCopiedCode(null), 2000);
                  }}
                  className="text-[10px] text-[var(--muted)] hover:text-white"
                >
                  {copiedCode === acc.email ? "Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
