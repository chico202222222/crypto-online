# Revisão de segurança — CryptoOnline

Revisão feita em 8 de outubro de 2026 para o deploy Next.js 16 na Vercel. Foram examinados configuração, Proxy, rotas HTTP, autenticação, cookies, CORS, chamadas externas, dependências e o serviço Crow/nginx incluído no repositório. O build, lint e testes HTTP locais passaram. Não houve teste em um deployment Vercel nem teste do Redis real, pois não há projeto/credenciais de produção ligados a este workspace.

## Ações obrigatórias antes de publicar

1. Configure `SESSION_SECRET`, `AUTH_STORE` e `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` na Vercel. No modo `env`, configure `AUTH_USERS_JSON`; no modo `firebase`, configure `FIREBASE_PROJECT_ID` e `FIREBASE_SERVICE_ACCOUNT_JSON`, mantenha `authUsers` sem acesso direto do cliente e dê à conta de serviço da Vercel apenas `roles/datastore.viewer`. O login retorna `503` sem a fonte de usuários; veja [README.md](README.md).
2. Troque todas as senhas e segredos TOTP que tenham usado os valores anteriormente escritos no código. A antiga chave Binance era devolvida na resposta HTTP da API; revogue/rotacione a chave se ela foi usada em qualquer ambiente acessível.
3. Se o serviço Crow/nginx for publicado fora da Vercel, trate-o como aplicação separada: suas rotas `/api/*` não exigem a sessão Next.js.

## Achados corrigidos

### SEC-01 — Crítico — Credenciais e segundo fator previsíveis

- **Local:** `app/api/auth/login/route.ts:54`, `crypto_utils/index.ts:22`, `cryptoRequestSchema/db/query.py:95`.
- **Evidência:** o estado anterior continha senhas literais, usuários padrão e um código de backup 2FA universal; o banco legado também criava um usuário de exemplo. Em produção, o login consulta `AUTH_USERS_JSON` ou a coleção privada `authUsers` no Firestore e exige hash `scrypt` e segredo TOTP individual. Em desenvolvimento local, também pode validar usuários habilitados no SQLite com o hash PBKDF2 legado. O banco não cria usuários automaticamente.
- **Impacto:** quem conhecesse os valores do repositório poderia entrar como usuário autorizado.
- **Correção:** valores embutidos e código universal removidos; lista de usuários vazia por padrão.
- **Mitigação restante:** rotacionar credenciais antigas fora do repositório. Não é possível confirmar se foram usadas em produção.

### SEC-02 — Alto — Cookie sem validação no Proxy e segredo de assinatura padrão

- **Local:** `proxy.ts:14`, `crypto_utils/index.ts:5`, `crypto_utils/index.ts:103`.
- **Evidência:** antes, qualquer cookie contendo `.` passava pelo Proxy. Agora a assinatura HMAC, expiração, formato e usuário ainda autorizado são validados. `SESSION_SECRET` não tem fallback.
- **Impacto:** acesso às páginas protegidas e tentativa de alcançar APIs com sessão forjada.
- **Correção:** validação no Proxy e novamente em `app/api/route.ts:28` e `app/api/coins/route.ts:55`.
- **Mitigação restante:** a segurança da assinatura depende de um `SESSION_SECRET` privado e aleatório. Sem ele, o login falha.

### SEC-03 — Alto — Chave da Binance devolvida ao navegador

- **Local:** `app/api/route.ts:26`.
- **Evidência:** a rota anterior incluía `X-MBX-APIKEY` em `headersProcessed.sentToUpstream`, enviado no JSON de resposta. A rota atual usa somente a API pública de dados e devolve apenas ticker e série de preços. O arquivo duplicado `cryptoRequestSchema/route.ts` agora reexporta a rota ativa.
- **Impacto:** exposição de uma chave configurada no servidor a qualquer cliente que recebesse aquela resposta.
- **Correção:** removida a chave, o eco de cabeçalhos e a exigência de `CRYPTO_API_KEY`.
- **Mitigação restante:** revogar/rotacionar a chave antiga se ela era real.

### SEC-04 — Alto — Rate limiting local insuficiente na Vercel

- **Local:** `crypto_utils/rate-limit.ts:8`, `app/api/auth/login/route.ts:46`.
- **Evidência:** o contador antigo era um `Map` por processo e usava `x-forwarded-for` como parte da chave. Agora o limite é de 10 tentativas por e-mail em 15 minutos no Redis compartilhado. Sem Redis em produção, o login retorna `503`; a memória é usada somente em desenvolvimento.
- **Impacto:** tentativas de senha/2FA poderiam ser distribuídas entre instâncias para escapar do bloqueio.
- **Correção:** contador distribuído Upstash e resposta `429` com `Retry-After`.
- **Mitigação restante:** limite por e-mail permite consumo de recursos com muitos e-mails distintos. Recomenda-se uma regra adicional por IP no Vercel Firewall, ajustada após observar o tráfego real.

### SEC-05 — Médio — Operações de sessão sem verificação explícita de origem

- **Local:** `app/api/auth/login/route.ts:14`, `app/api/auth/logout/route.ts:3`, `next.config.ts:4`.
- **Evidência:** login e logout agora exigem `Origin` igual à origem do pedido; login exige JSON e tamanho máximo de 4 KiB. A aplicação Next não anuncia CORS para outras origens. Cookies têm `HttpOnly`, `SameSite=Strict` e `Secure` em produção. Cabeçalhos de proteção foram adicionados globalmente.
- **Impacto:** pedidos de outra origem poderiam interferir na sessão, especialmente em navegadores com comportamento de cookies diferente.
- **Correção:** pedidos de outra origem retornam `403`; preflight externo não recebe `Access-Control-Allow-Origin`.
- **Nota:** o serviço Crow é independente; seu preflight usa `ALLOWED_ORIGIN` exato em `cryptoRequestSchema/crowStarter.cpp:16` e não libera credenciais entre origens.

## Riscos e limites restantes

### SEC-06 — Médio — Serviço Crow/nginx não compartilha a autenticação Next.js

- **Local:** `nginx/nginx.conf:104`, `cryptoRequestSchema/crowStarter.cpp:71`.
- **Evidência:** nginx publica `/api/plot`, `/api/value` e `/api/btc` diretamente para Crow, sem validar `crypto_session`. CORS do Crow agora é restrito, mas CORS não é autenticação.
- **Impacto:** se o stack nginx/Crow for exposto como terminal privado, as rotas de dados e geração de gráfico continuarão acessíveis sem login.
- **Correção necessária antes de usar esse stack:** exigir autenticação no gateway ou no Crow e aplicar limite de requisições. O deploy Vercel da aplicação Next.js não executa essas rotas.
- **Falso positivo possível:** se o stack legado permanecer somente local/interno, não há superfície pública correspondente.

### SEC-07 — Médio — Gráficos do serviço Crow usam valores fabricados

- **Local:** `cryptoRequestSchema/getValue.cpp:84`, `cryptoRequestSchema/getValue.cpp:120`.
- **Evidência:** em falhas do provedor, `getTicker` usa preços fixos; `getCandleData` gera uma onda senoidal a partir do preço, não candles históricos.
- **Impacto:** um deployment do Crow pode exibir preço e gráfico incorretos como se fossem mercado real.
- **Correção necessária antes de usar esse stack:** buscar candles reais e devolver erro quando o provedor falhar. O gráfico do Next/Vercel usa 24 fechamentos horários reais e valida valores em `app/api/route.ts:86`.

### SEC-08 — Baixo — Sessões assinadas sem revogação individual imediata

- **Local:** `crypto_utils/index.ts:96`, `app/api/auth/logout/route.ts:16`.
- **Evidência:** logout apaga o cookie no navegador, mas um token copiado antes permanece válido até expirar (24 horas, ou 7 dias com “Manter sessão”). Remover o usuário da configuração invalida seus tokens após as instâncias receberem a nova configuração; trocar `SESSION_SECRET` invalida todos.
- **Impacto:** um token roubado não pode ser revogado isoladamente com o desenho atual.
- **Mitigação:** sessões curtas, cookie HttpOnly/Strict/Secure; para revogação por dispositivo, mover sessões para armazenamento central.

### SEC-09 — Baixo para o runtime — Alertas em dependências de desenvolvimento

- **Local:** `package.json`, `package-lock.json`.
- **Evidência:** `npm audit` reportou cinco alertas de severidade alta na cadeia de `eslint-config-next`/`fast-glob`/`micromatch`/`braces`. `npm audit --omit=dev` reportou zero vulnerabilidades de produção. A correção automática sugerida pelo npm faz downgrade incompatível de `eslint-config-next`.
- **Ação:** atualizar a cadeia de ferramentas quando houver uma versão compatível corrigida; não fazer downgrade automático para Next 14 em um projeto Next 16.

## Verificações executadas

- `npm run build` e `npm run lint`: passaram.
- Fluxo HTTP em desenvolvimento: redirecionamento anônimo, API `401`, cookie forjado `401`, origem externa `403`, TOTP válido/inválido, logout e `429` na 11ª tentativa: passaram.
- Fluxo HTTP em produção sem Redis: login `503`, conforme configuração segura.
- Catálogo autenticado: 506 pares spot/USDT ativos no teste; BTC e ADA plotados no navegador; API Binance testada também para ativos de baixo preço e símbolos Unicode. O total pode mudar com a listagem da Binance.
- Serviço Crow: compilação CMake e preflight CORS com origem permitida `204` e origem externa `403`: passaram.
- `python3 -m py_compile` para scripts SQLite: passou.
