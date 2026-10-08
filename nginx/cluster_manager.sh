#!/usr/bin/env bash
# este script sobe os serviços em pares e coloca o nginx na frente

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RUN_DIR="$SCRIPT_DIR/run"
LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$RUN_DIR" "$LOG_DIR"

check_port() {
    local port="$1"
    lsof -ti :"$port" -sTCP:LISTEN 2>/dev/null || true
}

check_http() {
    local url="$1"
    curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "$url" 2>/dev/null || echo "DOWN"
}

start_cluster() {
    echo "================================================================================"
    echo " INICIANDO CLUSTER LOAD BALANCER COMPLETO"
    echo "================================================================================"

    # compila o serviço se o executável ainda não estiver pronto
    CROW_BIN="$PROJECT_ROOT/cryptoRequestSchema/server"
    if [ ! -f "$CROW_BIN" ]; then
        echo "Compilando microserviço C++ Crow..."
        make -C "$PROJECT_ROOT/cryptoRequestSchema"
    fi

    # sobe a primeira instância do serviço de dados
    PID_18080=$(check_port 18080)
    if [ -n "$PID_18080" ]; then
        echo "Crow C++ [Node 1] já está rodando na porta 18080 (PID: $PID_18080)."
    else
        echo "Iniciando Crow C++ [Node 1] na porta 18080..."
        (cd "$PROJECT_ROOT/cryptoRequestSchema" && ./server 18080 > "$LOG_DIR/crow_18080.log" 2>&1 & echo $! > "$RUN_DIR/crow_18080.pid")
    fi

    # sobe a segunda instância do serviço de dados
    PID_18081=$(check_port 18081)
    if [ -n "$PID_18081" ]; then
        echo "Crow C++ [Node 2] já está rodando na porta 18081 (PID: $PID_18081)."
    else
        echo "Iniciando Crow C++ [Node 2] na porta 18081..."
        (cd "$PROJECT_ROOT/cryptoRequestSchema" && ./server 18081 > "$LOG_DIR/crow_18081.log" 2>&1 & echo $! > "$RUN_DIR/crow_18081.pid")
    fi

    # sobe a primeira instância da aplicação
    PID_3001=$(check_port 3001)
    if [ -n "$PID_3001" ]; then
        echo "Next.js [Node 1] já está rodando na porta 3001 (PID: $PID_3001)."
    else
        echo "Iniciando Next.js [Node 1] na porta 3001..."
        (cd "$PROJECT_ROOT" && npx next dev -p 3001 > "$LOG_DIR/nextjs_3001.log" 2>&1 & echo $! > "$RUN_DIR/nextjs_3001.pid")
    fi

    # sobe a segunda instância da aplicação
    PID_3002=$(check_port 3002)
    if [ -n "$PID_3002" ]; then
        echo "Next.js [Node 2] já está rodando na porta 3002 (PID: $PID_3002)."
    else
        echo "Iniciando Next.js [Node 2] na porta 3002..."
        (cd "$PROJECT_ROOT" && npx next dev -p 3002 > "$LOG_DIR/nextjs_3002.log" 2>&1 & echo $! > "$RUN_DIR/nextjs_3002.pid")
    fi

    # deixa o nginx distribuir as chamadas entre as instâncias
    "$SCRIPT_DIR/start_lb.sh"

    echo ""
    echo "Cluster inicializado com sucesso!"
    echo "Acesse a aplicação balanceada em: http://localhost:3000"
    echo "Status do Load Balancer em      : http://localhost:3000/lb-status"
}

stop_cluster() {
    echo "================================================================================"
    echo " PARANDO CLUSTER LOAD BALANCER"
    echo "================================================================================"

    # para a entrada antes de encerrar as instâncias
    "$SCRIPT_DIR/stop_lb.sh" || true

    # encerra as instâncias do serviço de dados
    for PORT in 18080 18081; do
        PID=$(check_port "$PORT")
        if [ -n "$PID" ]; then
            echo "Parando Crow C++ na porta $PORT (PID: $PID)..."
            kill -15 $PID 2>/dev/null || kill -9 $PID 2>/dev/null || true
        fi
        rm -f "$RUN_DIR/crow_${PORT}.pid"
    done

    # encerra as instâncias da aplicação
    for PORT in 3001 3002; do
        PID=$(check_port "$PORT")
        if [ -n "$PID" ]; then
            echo "Parando Next.js na porta $PORT (PID: $PID)..."
            kill -15 $PID 2>/dev/null || kill -9 $PID 2>/dev/null || true
        fi
        rm -f "$RUN_DIR/nextjs_${PORT}.pid"
    done

    echo "Todas as instâncias do cluster foram finalizadas."
}

status_cluster() {
    echo "================================================================================"
    echo " STATUS DO CLUSTER (LOAD BALANCER & BACKENDS)"
    echo "================================================================================"
    printf "%-22s %-10s %-12s %-12s\n" "COMPONENTE" "PORTA" "STATUS" "PID"
    echo "--------------------------------------------------------------------------------"

    # confere o balanceador
    NGINX_PID=$(check_port 3000)
    NGINX_HTTP=$(check_http "http://127.0.0.1:3000/lb-status")
    if [ -n "$NGINX_PID" ]; then
        printf "%-22s %-10s %-12s %-12s\n" "Nginx Load Balancer" "3000" "ONLINE ($NGINX_HTTP)" "$NGINX_PID"
    else
        printf "%-22s %-10s %-12s %-12s\n" "Nginx Load Balancer" "3000" "PARADO" "-"
    fi

    # confere a primeira instância da aplicação
    NEXT1_PID=$(check_port 3001)
    NEXT1_HTTP=$(check_http "http://127.0.0.1:3001")
    if [ -n "$NEXT1_PID" ]; then
        printf "%-22s %-10s %-12s %-12s\n" "Next.js Node 1" "3001" "ONLINE ($NEXT1_HTTP)" "$NEXT1_PID"
    else
        printf "%-22s %-10s %-12s %-12s\n" "Next.js Node 1" "3001" "PARADO" "-"
    fi

    # confere a segunda instância da aplicação
    NEXT2_PID=$(check_port 3002)
    NEXT2_HTTP=$(check_http "http://127.0.0.1:3002")
    if [ -n "$NEXT2_PID" ]; then
        printf "%-22s %-10s %-12s %-12s\n" "Next.js Node 2" "3002" "ONLINE ($NEXT2_HTTP)" "$NEXT2_PID"
    else
        printf "%-22s %-10s %-12s %-12s\n" "Next.js Node 2" "3002" "PARADO" "-"
    fi

    # confere a primeira instância do serviço de dados
    CROW1_PID=$(check_port 18080)
    CROW1_HTTP=$(check_http "http://127.0.0.1:18080/health")
    if [ -n "$CROW1_PID" ]; then
        printf "%-22s %-10s %-12s %-12s\n" "Crow C++ Node 1" "18080" "ONLINE ($CROW1_HTTP)" "$CROW1_PID"
    else
        printf "%-22s %-10s %-12s %-12s\n" "Crow C++ Node 1" "18080" "PARADO" "-"
    fi

    # confere a segunda instância do serviço de dados
    CROW2_PID=$(check_port 18081)
    CROW2_HTTP=$(check_http "http://127.0.0.1:18081/health")
    if [ -n "$CROW2_PID" ]; then
        printf "%-22s %-10s %-12s %-12s\n" "Crow C++ Node 2" "18081" "ONLINE ($CROW2_HTTP)" "$CROW2_PID"
    else
        printf "%-22s %-10s %-12s %-12s\n" "Crow C++ Node 2" "18081" "PARADO" "-"
    fi
    echo "================================================================================"
}

test_cluster() {
    echo "================================================================================"
    echo " TESTANDO DISPATCHING & HEADERS DO LOAD BALANCER"
    echo "================================================================================"

    echo "1. Consultando /lb-status via Nginx (Porta 3000):"
    curl -s -i "http://localhost:3000/lb-status" | head -n 12
    echo ""

    echo "2. Consultando C++ Crow Health via Nginx (/health/crow):"
    curl -s -i "http://localhost:3000/health/crow" | head -n 14
    echo ""

    echo "3. Consultando C++ Crow API Value (/api/value?coin=BTCUSDT):"
    curl -s -i "http://localhost:3000/api/value?coin=BTCUSDT" | head -n 14
    echo ""

    echo "4. Consultando Next.js Frontend via Nginx (/):"
    curl -s -i "http://localhost:3000/" | head -n 14
    echo ""
}

case "${1:-}" in
    start)
        start_cluster
        ;;
    stop)
        stop_cluster
        ;;
    restart)
        stop_cluster
        sleep 1
        start_cluster
        ;;
    status)
        status_cluster
        ;;
    test)
        test_cluster
        ;;
    *)
        echo "Uso: $0 {start|stop|restart|status|test}"
        exit 1
        ;;
esac
