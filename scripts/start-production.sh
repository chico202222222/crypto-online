#!/bin/sh
set -e

# Se o binário do Crow C++ existir, inicializa em background na porta 18080
if [ -f "./cryptoRequestSchema/server" ]; then
  echo "🚀 [Crow C++] Iniciando microserviço na porta 18080..."
  ./cryptoRequestSchema/server 18080 &
fi

# Railway injeta a porta pública na variável $PORT
PORT="${PORT:-3000}"
echo "🌐 [Next.js] Iniciando aplicação na porta $PORT..."
exec npx next start -p "$PORT"
