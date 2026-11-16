# CryptoOnline — Terminal Wyckoff

Plataforma web para monitoramento de criptomoedas em tempo real e análise automatizada da estrutura de mercado pelo **Método Wyckoff** (fases de Acumulação e Distribuição, suporte, resistência e volume) sobre candles reais.

---

## Stack do Projeto

- **Next.js 16 (App Router) & React 19** — Frontend, SSR e rotas de API (`app/api/*`).
- **TypeScript & Tailwind CSS v4** — Tipagem estática e estilização da interface.
- **Lightweight Charts** — Renderização interativa de gráficos financeiros e marcações Wyckoff no navegador.
- **Binance Public Data API** — Fonte de dados de mercado (candles/klines e tickers spot em tempo real).
- **SQLite3 (`node:sqlite` / Python) / Firebase Firestore / Env** — Camada flexível de persistência e autenticação de usuários com **2FA (TOTP RFC 6238)** e controle de acesso por papéis (`administrador`, `mestre`, `aprendiz`).
- **Upstash Redis** — Rate limiting distribuído para proteção de tentativas de login em produção (com fallback em memória no ambiente local).

> **Nota sobre o C++ (Depreciado):** O antigo microsserviço em C++ (`cryptoRequestSchema/` com Crow Framework e Matplot++) foi **depreciado** e não é mais necessário para rodar o projeto. Toda a coleta de cotações, cálculo das fases Wyckoff e plotagem de gráficos agora roda nativamente pelo Next.js + Lightweight Charts.

---

## Pré-requisitos

- **Node.js** `>= 22.13.0` (necessário para o módulo nativo `node:sqlite` e Next.js 16)
- **npm** (incluído com o Node.js)
- **Python 3** *(opcional — apenas se desejar inicializar o banco SQLite via script Python)*

---

## Como Rodar o Projeto Localmente

### 1. Instalar as dependências

```bash
npm install
```

### 2. Configurar as variáveis de ambiente

Copie o arquivo de exemplo `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

No PowerShell (Windows):

```powershell
Copy-Item .env.example .env.local
```

Gere uma chave secreta de sessão (`SESSION_SECRET`) com pelo menos 32 caracteres:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cole o valor gerado em `SESSION_SECRET=` dentro do seu `.env.local`.

### 3. Configurar o armazenamento de usuários (`AUTH_STORE`)

Você pode escolher um dos três modos abaixo no `.env.local`:

#### Opção A: Via Variável de Ambiente (`AUTH_STORE=env`) — *Recomendado para início rápido*
Não requer banco de dados externo. Gere um usuário e segredo 2FA executando:

```bash
echo "SuaSenhaForte123" | node scripts/create-env-user.mjs seu-email@exemplo.com
```

O comando retornará:
1. A linha `AUTH_USERS_JSON={...}` — copie e cole no seu `.env.local`.
2. O segredo/URI TOTP — adicione no seu app autenticador (Google Authenticator, Authy, etc.) para gerar o código de 6 dígitos no login.

#### Opção B: Via SQLite Local (`AUTH_STORE=sqlite`)
1. No `.env.local`, defina:
   ```env
   AUTH_STORE=sqlite
   DB_PATH=cryptoRequestSchema/db/users.db
   ```
2. Inicialize o arquivo do banco SQLite com Python:
   ```bash
   python cryptoRequestSchema/db/createsqlite.py
   ```

#### Opção C: Via Firebase Firestore (`AUTH_STORE=firebase`)
1. No `.env.local`, defina:
   ```env
   AUTH_STORE=firebase
   FIREBASE_PROJECT_ID=seu-projeto-id
   FIREBASE_SERVICE_ACCOUNT_JSON={"project_id":"...","client_email":"...","private_key":"..."}
   ```
2. Crie um usuário no Firestore:
   ```bash
   echo "SuaSenhaForte123" | node scripts/create-firebase-user.mjs seu-email@exemplo.com
   ```

### 4. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse **[http://localhost:3000](http://localhost:3000)** no navegador.

---

## Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor de desenvolvimento do Next.js em `http://localhost:3000` |
| `npm run build` | Compila a aplicação para produção |
| `npm run start` | Inicia o servidor Next.js em modo de produção (após `npm run build`) |
| `npm run lint` | Executa a verificação estática de código com ESLint |
| `npm test` | Executa os testes automatizados (`node --test tests/*.test.mjs`) |

---

## Licença

Distribuído sob a licença **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais informações.
