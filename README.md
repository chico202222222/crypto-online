_arquitetura do projeto:_

STACK ESCOLHIDO:

- NEXT.JS
- PYTHON (lidar com sqlite de forma mais fácil)
- SQLITE3 (db simples, 2 usuários)
- RUST (Axum para API e Plotters para PNG em memória)

_objetivo do projeto_:

o projeto se consiste em uma página web com um dashboard automatizado que plota gráficos de tantos em tantos segundos, que puxa valores de bitcoins em uma api, e essa plataforma serve pra poder gerenciar suas criptomoedas e pode escolher tambem pra notificar quando houver um certo padrão ou quando estiver em um certo intervalo.

MIT LICENCE, 2026.

## Serviço Rust principal

O backend de mercado fica em `crypto_service/` e atende `/api/value`, `/api/btc`, `/api/plot` e `/health` na porta 18080. O Next.js usa `RUST_API_URL` ou `http://127.0.0.1:18080` por padrão.

```sh
npm ci
cargo build --release --locked --manifest-path crypto_service/Cargo.toml
npm run build
./scripts/start-production.sh
```

Para desenvolvimento, execute `cargo run --manifest-path crypto_service/Cargo.toml -- 18080` e `npm run dev` em terminais separados. O Dockerfile compila o binário Rust e inicia os dois serviços.

Quando a Binance não responde, a API usa dados simulados e marca `source: "simulated"`; o dashboard exibe essa condição. Os gráficos do serviço Rust são gerados em memória e representam uma série estimada.
