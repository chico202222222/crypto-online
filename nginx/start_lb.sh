#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="$SCRIPT_DIR/run/nginx.pid"
CONF_FILE="$SCRIPT_DIR/nginx.conf"

NGINX_BIN="$(which nginx 2>/dev/null || echo "/opt/homebrew/bin/nginx")"
if [ ! -x "$NGINX_BIN" ]; then
    echo "Erro: Nginx não foi encontrado em /opt/homebrew/bin/nginx nem no PATH."
    exit 1
fi

mkdir -p "$SCRIPT_DIR/logs" "$SCRIPT_DIR/run" \
         "$SCRIPT_DIR/temp/client_body" "$SCRIPT_DIR/temp/proxy" \
         "$SCRIPT_DIR/temp/fastcgi" "$SCRIPT_DIR/temp/uwsgi" "$SCRIPT_DIR/temp/scgi"

if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "Nginx Load Balancer já está em execução (PID: $PID na porta 3000)."
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

# confere se a porta já está ocupada antes de iniciar
PORT_USER=$(lsof -ti :3000 -sTCP:LISTEN || true)
if [ -n "$PORT_USER" ]; then
    echo "Erro: A porta 3000 já está ocupada pelo processo PID $PORT_USER."
    echo "   Finalize o processo anterior antes de iniciar o Nginx Load Balancer."
    exit 1
fi

echo "Validando sintaxe da configuração do Nginx..."
"$NGINX_BIN" -t -p "$SCRIPT_DIR" -c "$CONF_FILE"

echo "Iniciando Nginx Load Balancer..."
"$NGINX_BIN" -p "$SCRIPT_DIR" -c "$CONF_FILE"

sleep 0.5
if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE")"
    echo "Nginx Load Balancer rodando com sucesso!"
    echo "   Entrypoint : http://localhost:3000"
    echo "   Status     : http://localhost:3000/lb-status"
    echo "   PID        : $PID"
    echo "   Algoritmo  : IP Hash (ip_hash)"
else
    echo "Nginx iniciado, mas PID file ainda não foi criado."
fi
