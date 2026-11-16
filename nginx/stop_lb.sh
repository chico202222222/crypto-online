#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/run/nginx.pid"
CONF_FILE="$SCRIPT_DIR/nginx.conf"

NGINX_BIN="$(which nginx 2>/dev/null || echo "/opt/homebrew/bin/nginx")"

echo "Parando Nginx Load Balancer..."

if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE" 2>/dev/null)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        "$NGINX_BIN" -p "$SCRIPT_DIR" -c "$CONF_FILE" -s quit 2>/dev/null || kill -QUIT "$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null
        rm -f "$PID_FILE"
        echo "Nginx Load Balancer finalizado com sucesso (PID $PID)."
        exit 0
    fi
    rm -f "$PID_FILE"
fi

# se o arquivo do processo sumiu, procura quem ainda está usando a porta
PIDS=$(lsof -ti :3000 -sTCP:LISTEN || true)
if [ -n "$PIDS" ]; then
    echo "Encontrado processo(s) escutando na porta 3000: $PIDS. Finalizando..."
    kill -9 $PIDS 2>/dev/null || true
    echo "Porta 3000 liberada."
else
    echo "Nenhum processo Nginx em execução na porta 3000."
fi
