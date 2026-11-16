#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/run/nginx.pid"
CONF_FILE="$SCRIPT_DIR/nginx.conf"

NGINX_BIN="$(which nginx 2>/dev/null || echo "/opt/homebrew/bin/nginx")"

if [ ! -f "$PID_FILE" ]; then
    echo "Erro: PID do Nginx não encontrado. Inicie o load balancer primeiro com ./nginx/start_lb.sh"
    exit 1
fi

echo "Validando nova configuração..."
"$NGINX_BIN" -t -p "$SCRIPT_DIR" -c "$CONF_FILE"

echo "Recarregando Nginx Load Balancer sem downtime..."
"$NGINX_BIN" -p "$SCRIPT_DIR" -c "$CONF_FILE" -s reload
echo "Configuração do Nginx recarregada com sucesso!"
