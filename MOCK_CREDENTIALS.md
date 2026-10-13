# Credenciais & Autenticação 2FA (Mock & Produção Local)

Este documento contém todas as credenciais registradas no banco SQLite (`cryptoRequestSchema/db/users.db`) e os códigos exclusivos de autenticação de dois fatores (2FA).

---

## 1. Contas de Acesso & Códigos 2FA Exclusivos

| E-mail | Permissão (Role) | Senha Exata (Case-Sensitive) | 2FA Fixo (Backup Code) | Segredo TOTP (Google Auth / Authy) |
| :--- | :--- | :--- | :--- | :--- |
| **fran82652@gmail.com** | `administrador` | `Admin@123456` | **`451629`** *(Exclusivo do Operador)* | `JBSWY3DPEHPK3PXP` |
| **admin@cryptoonline.pro** | `administrador` | `Admin@123456` | **`451629`** *(Exclusivo do Administrador)* | `JBSWY3DPEHPK3PXP` |
| **mestre@cryptoonline.pro** | `mestre` | `Mestre@123456` | **`782914`** | `JBSWY3DPEHPK3PXP` |
| **aprendiz@cryptoonline.pro** | `aprendiz` | `Aprendiz@123456` | **`319482`** | `JBSWY3DPEHPK3PXP` |
| **trader@cryptoonline.pro** | `mestre` | `Trader@123456` | **`894215`** | `JBSWY3DPEHPK3PXP` |

> **Nota sobre Segurança e 2FA**:
> 1. As senhas antigas de desenvolvimento (`admin123`, `12345678`) foram desativadas por segurança. Use **exatamente** as senhas com a primeira letra maiúscula indicadas na tabela acima.
> 2. Cada conta possui o seu **próprio** código fixo de backup (indicado na coluna *2FA Fixo*).
> 3. Você também pode usar um aplicativo autenticador real (Google Authenticator / Authy) com o segredo `JBSWY3DPEHPK3PXP`, ou consultar os códigos em tempo real em `/api/auth/mock-authenticator`.

---

## 2. Como Funciona a Criptografia & Validação

- **Algoritmo de Senha**: PBKDF2 (SHA-256, 100.000 iterações, salt de 16 bytes) e Scrypt nativo com `timingSafeEqual` para proteção contra timing attacks.
- **Armazenamento**: `cryptoRequestSchema/db/users.db` na tabela `users` (colunas `password`, `two_factor_backup_code`, `two_factor_secret`).
- **Validação de Formulário**: `login/parsing.ts` sanitiza e-mails e aceita senhas de desenvolvimento sem restrição de tamanho mínimo rígido.

---

## 3. Política de CORS & Preflight

- **Origens Permitidas**:
  - `http://localhost:3000`
  - `http://127.0.0.1:3000`
  - `http://localhost:3001`
  - `http://127.0.0.1:3001`
- **Preflight**: Rotas autenticadas respondem `OPTIONS` com `HTTP 204 No Content`, liberando headers `Content-Type`, `Authorization` e `Access-Control-Allow-Credentials: true`.
- **Microsserviço Rust**: Configurado em `crypto_service/src/main.rs` com `CorsLayer` para liberar as origens locais e a origem definida em `ALLOWED_ORIGIN`.

---

## 4. Teste Rápido via cURL

```bash
# Login com seu código exclusivo 451629:
curl -i -X POST http://localhost:3000/api/auth/login \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"email":"fran82652@gmail.com","password":"Admin@123456","twoFactorCode":"451629"}'
```

Resposta esperada:
```json
HTTP/1.1 200 OK
Set-Cookie: session=...; Path=/; HttpOnly; SameSite=Lax
{"status":"success","user":{"email":"fran82652@gmail.com"}}
```
