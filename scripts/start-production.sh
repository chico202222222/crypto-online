#!/bin/sh
set -e

RUST_SERVER_BIN="${RUST_SERVER_BIN:-./crypto_service/target/release/crypto-server}"
if [ ! -x "$RUST_SERVER_BIN" ]; then
  echo "Binário Rust não encontrado: $RUST_SERVER_BIN" >&2
  exit 1
fi

echo "🚀 [Rust] Iniciando microserviço na porta 18080..."
mkdir -p crypto_service/.run
"$RUST_SERVER_BIN" 18080 &
rust_pid=$!
echo "$rust_pid" > crypto_service/.run/server-18080.pid
sleep 1
if ! kill -0 "$rust_pid" 2>/dev/null; then
  echo "Microserviço Rust falhou ao iniciar." >&2
  exit 1
fi

# Railway injeta a porta pública na variável $PORT
PORT="${PORT:-3000}"
echo "🌐 [Next.js] Iniciando aplicação na porta $PORT..."
exec npx next start -p "$PORT"
