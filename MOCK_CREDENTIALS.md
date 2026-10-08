# Credenciais & Autenticação 2FA (Mock & Produção Local)

Este documento contém todas as credenciais registradas no banco SQLite (`cryptoRequestSchema/db/users.db`) e os códigos exclusivos de autenticação de dois fatores (2FA).

---

## 1. Contas de Acesso & Códigos 2FA Exclusivos

| E-mail | Permissão (Role) | Senhas Aceitas | 2FA Exclusivo (Sempre Válido) | Segredo TOTP (Google Auth / Authy) |
| :--- | :--- | :--- | :--- | :--- |
| **fran82652@gmail.com** | `administrador` | `Admin@123456`<br>`admin123`<br>`12345678` | **`451629`** *(Exclusivo do Operador)* | `JBSWY3DPEHPK3PXP` |
| **admin@cryptoonline.pro** | `administrador` | `Admin@123456`<br>`admin123`<br>`12345678` | **`451629`** *(Exclusivo do Operador)* | `JBSWY3DPEHPK3PXP` |
| **mestre@cryptoonline.pro** | `mestre` | `Mestre@123456`<br>`mestre123`<br>`12345678` | **`782914`** | `JBSWY3DPEHPK3PXP` |
| **aprendiz@cryptoonline.pro** | `aprendiz` | `Aprendiz@123456`<br>`aprendiz123`<br>`12345678` | **`319482`** | `JBSWY3DPEHPK3PXP` |
| **trader@cryptoonline.pro** | `mestre` | `Trader@123456`<br>`trader123`<br>`12345678` | **`894215`** | `JBSWY3DPEHPK3PXP` |

> **Nota sobre o 2FA**:
> 1. O código exclusivo **`451629`** sempre funcionará de forma permanente para a sua conta e para o administrador, sem expirar.
> 2. Além do código exclusivo permanente, o aplicativo autenticador físico (Google Authenticator, Authy, etc.) também funciona utilizando o segredo `JBSWY3DPEHPK3PXP` (RFC 6238 TOTP).
> 3. Em ambiente local/desenvolvimento, o código `123456` também é aceito como contingência rápida.

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
- **Microsserviço Crow C++**: Configurado em `cryptoRequestSchema/crowStarter.cpp` para validar e liberar as portas `3000` e `3001` com `Access-Control-Allow-Origin`.

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
