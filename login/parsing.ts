import { z } from "zod";


export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "O e-mail é obrigatório.")
    .email("Informe um endereço de e-mail válido."),

  password: z
    .string()
    .min(1, "A senha é obrigatória."),

  rememberMe: z
    .boolean()
    .default(false),

  twoFactorCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "O código 2FA deve conter exatamente 6 dígitos numéricos.")
    .optional()
    .or(z.literal("")),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginFormErrors = Partial<Record<keyof LoginInput, string>>;
export type ValidationResult =
  | { success: true; data: LoginInput; errors?: never }
  | { success: false; errors: LoginFormErrors; data?: never };
export function validateLoginForm(
  input: Record<string, unknown> | FormData | unknown
): ValidationResult {
  let rawData: Record<string, unknown> = {};

  if (typeof FormData !== "undefined" && input instanceof FormData) {
    rawData = {
      email: input.get("email"),
      password: input.get("password"),
      rememberMe: input.get("rememberMe") === "true" || input.get("rememberMe") === "on",
      twoFactorCode: input.get("twoFactorCode") || undefined,
    };
  } else if (input && typeof input === "object") {
    rawData = input as Record<string, unknown>;
  }
  const parsed = loginSchema.safeParse(rawData);

  if (parsed.success) {
    return {
      success: true,
      data: parsed.data,
    };
  }

  const errors: LoginFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof LoginInput;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return {
    success: false,
    errors,
  };
}
