import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/crypto_utils";
import { spawn, execSync } from "node:child_process";
import path from "node:path";

export async function POST(request: Request) {
  const token = (await cookies()).get("crypto_session")?.value;
  if (!token) {
    return NextResponse.json({ status: "error", message: "Não autenticado." }, { status: 401 });
  }

  const verified = await verifySessionToken(token);
  if (!verified.valid || !verified.email) {
    return NextResponse.json({ status: "error", message: "Sessão inválida." }, { status: 401 });
  }

  // Apenas 'administrador' pode gerenciar o processo do Crow
  if (verified.role !== "administrador") {
    return NextResponse.json(
      {
        status: "error",
        message: "Acesso negado. Apenas o 'administrador' pode gerenciar processos do servidor.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = (await request.json()) as { action?: string; port?: number };
    const action = body.action || "restart";
    const port = body.port || 18080;

    // Localiza e encerra processos Crow existentes na porta
    try {
      const pidStr = execSync(`lsof -ti :${port} -sTCP:LISTEN 2>/dev/null || true`).toString().trim();
      if (pidStr) {
        for (const pid of pidStr.split("\n")) {
          if (pid.trim()) {
            execSync(`kill -15 ${pid.trim()} 2>/dev/null || kill -9 ${pid.trim()} 2>/dev/null || true`);
          }
        }
      }
    } catch {}

    if (action === "stop") {
      return NextResponse.json(
        { status: "success", message: `Crow C++ na porta ${port} finalizado com sucesso.` },
        { status: 200 }
      );
    }

    // Inicia ou reinicia Crow
    const serverPath = path.resolve(process.cwd(), "cryptoRequestSchema/server");
    const child = spawn(serverPath, [String(port)], {
      detached: true,
      stdio: "ignore",
      cwd: path.resolve(process.cwd(), "cryptoRequestSchema"),
    });
    child.unref();

    // Aguarda 800ms para verificar inicialização
    await new Promise((resolve) => setTimeout(resolve, 800));

    return NextResponse.json(
      {
        status: "success",
        message: `Crow C++ reiniciado com sucesso na porta ${port} (PID: ${child.pid}).`,
        port,
        pid: child.pid,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: "error", message: "Erro ao gerenciar processo Crow: " + msg },
      { status: 500 }
    );
  }
}
