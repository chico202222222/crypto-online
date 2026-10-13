import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, listAllUsers, updateUserRoleInStore, type UserRole } from "@/crypto_utils";
import { z } from "zod";
import { requestLogger } from "@/crypto_utils/logger";

const updateRoleSchema = z.object({
  email: z.string().email(),
  role: z.enum(["administrador", "mestre", "aprendiz"]),
});

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("mercury_session")?.value || cookieStore.get("crypto_session")?.value;
  if (!token) {
    return NextResponse.json({ status: "error", message: "Não autenticado." }, { status: 401 });
  }

  const verified = await verifySessionToken(token);
  if (!verified.valid || !verified.email) {
    return NextResponse.json({ status: "error", message: "Sessão inválida." }, { status: 401 });
  }

  const users = await listAllUsers();
  return NextResponse.json(
    {
      status: "success",
      currentUser: {
        email: verified.email,
        role: verified.role ?? "aprendiz",
      },
      users,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

export async function PATCH(request: Request) {
  const log = requestLogger(request, "admin-users");
  const cookieStore = await cookies();
  const token = cookieStore.get("mercury_session")?.value || cookieStore.get("crypto_session")?.value;
  if (!token) {
    return NextResponse.json({ status: "error", message: "Não autenticado." }, { status: 401 });
  }

  const verified = await verifySessionToken(token);
  if (!verified.valid || !verified.email) {
    return NextResponse.json({ status: "error", message: "Sessão inválida." }, { status: 401 });
  }

  // Apenas 'administrador' pode alterar papéis de usuários
  if (verified.role !== "administrador") {
    log.warn("role change denied", { actor: verified.email, actorRole: verified.role ?? "aprendiz" });
    return NextResponse.json(
      {
        status: "error",
        message: "Acesso negado. Apenas usuários com permissão 'administrador' podem alterar funções.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { status: "error", message: "Dados inválidos para atualização de permissão." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { email, role } = parsed.data;
    const success = await updateUserRoleInStore(email, role as UserRole);
    // Auditoria: usuário já autenticado como administrador, então os e-mails entram completos.
    log.info("role change", { actor: verified.email, target: email, newRole: role, applied: success });

    if (!success) {
      return NextResponse.json(
        { status: "error", message: "Usuário não encontrado ou erro ao gravar no banco." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        status: "success",
        message: `Permissão de ${email} atualizada com sucesso para '${role}'.`,
        updated: { email, role },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    log.error("role change failed", { actor: verified.email, error });
    return NextResponse.json(
      { status: "error", message: "Erro ao processar alteração de permissão." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
