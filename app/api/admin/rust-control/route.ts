import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/crypto_utils";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { requestLogger } from "@/crypto_utils/logger";

export async function POST(request: Request) {
  const log = requestLogger(request, "rust-control");
  const cookieStore = await cookies();
  const token = cookieStore.get("mercury_session")?.value || cookieStore.get("crypto_session")?.value;
  if (!token) {
    return NextResponse.json({ status: "error", message: "Não autenticado." }, { status: 401 });
  }

  const verified = await verifySessionToken(token);
  if (!verified.valid || !verified.email) {
    return NextResponse.json({ status: "error", message: "Sessão inválida." }, { status: 401 });
  }

  // Apenas 'administrador' pode gerenciar o processo Rust
  if (verified.role !== "administrador") {
    log.warn("rust control denied", { actor: verified.email, actorRole: verified.role ?? "aprendiz" });
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
    const action = body.action === "stop" ? "stop" : body.action === "start" ? "start" : "restart";
    const port = Number(body.port ?? 18080);

    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      return NextResponse.json(
        { status: "error", message: "Porta inválida (deve ser um inteiro entre 1024 e 65535)." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const runDir = path.resolve(process.cwd(), "crypto_service/.run");
    const pidFile = path.join(runDir, `server-${port}.pid`);
    let runningPid: number | null = null;
    try {
      const pid = Number(readFileSync(pidFile, "utf8").trim());
      if (Number.isInteger(pid) && pid > 1 && pid !== process.pid) {
        process.kill(pid, 0);
        runningPid = pid;
      }
    } catch {
      rmSync(pidFile, { force: true });
    }

    if (runningPid && action !== "start") {
      process.kill(runningPid, "SIGTERM");
      rmSync(pidFile, { force: true });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (action === "stop") {
      log.info("rust control", { actor: verified.email, action, port, pid: runningPid });
      return NextResponse.json(
        { status: "success", message: runningPid ? `Serviço Rust na porta ${port} finalizado.` : `Nenhum processo Rust gerenciado na porta ${port}.` },
        { status: 200 }
      );
    }

    if (runningPid && action === "start") {
      log.info("rust control: already running", { actor: verified.email, action, port, pid: runningPid });
      return NextResponse.json(
        { status: "success", message: `Serviço Rust já está ativo na porta ${port} (PID: ${runningPid}).`, port, pid: runningPid },
        { status: 200 }
      );
    }

    const serverPath = process.env.RUST_SERVER_BIN || path.resolve(process.cwd(), "crypto_service/target/release/crypto-server");
    if (!existsSync(/* turbopackIgnore: true */ serverPath)) {
      log.error("rust binary not found", { actor: verified.email, serverPath });
      return NextResponse.json(
        { status: "error", message: `Binário Rust não encontrado: ${serverPath}` },
        { status: 503 }
      );
    }
    const child = spawn(/* turbopackIgnore: true */ serverPath, [String(port)], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", reject);
    });
    child.unref();
    mkdirSync(runDir, { recursive: true });
    writeFileSync(pidFile, String(child.pid));

    let healthy = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        process.kill(child.pid!, 0);
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(500),
        });
        if (response.ok && response.headers.get("x-backend-instance") === `rust-${port}`) {
          healthy = true;
          break;
        }
      } catch {}
    }
    if (!healthy) {
      log.error("rust failed health check after spawn", { actor: verified.email, action, port, pid: child.pid });
      rmSync(pidFile, { force: true });
      if (child.pid) {
        try { process.kill(child.pid, "SIGTERM"); } catch {}
      }
      return NextResponse.json(
        { status: "error", message: `Serviço Rust não iniciou na porta ${port}.` },
        { status: 503 }
      );
    }

    log.info("rust control", { actor: verified.email, action, port, pid: child.pid });
    return NextResponse.json(
      {
        status: "success",
        message: `Serviço Rust iniciado na porta ${port} (PID: ${child.pid}).`,
        port,
        pid: child.pid,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("rust control failed", { actor: verified.email, error: err });
    return NextResponse.json(
      { status: "error", message: "Erro ao gerenciar processo Rust: " + msg },
      { status: 500 }
    );
  }
}
