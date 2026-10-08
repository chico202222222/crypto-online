#include <crow.h>
#include "getValue.h"

#include <iostream>
#include <string>
#include <fstream>
#include <vector>
#include <cstdlib>

inline bool isAllowedOrigin(const std::string& origin, const std::string& configured) {
    if (origin.empty()) return false;
    if (origin == configured) return true;
    if (origin == "http://localhost:3000" || origin == "http://localhost:3001" ||
        origin == "http://127.0.0.1:3000" || origin == "http://127.0.0.1:3001") return true;
    return false;
}

struct CorsPreflight {
    struct context {};
    std::string allowedOrigin;

    void before_handle(crow::request&, crow::response&, context&) {}

    void after_handle(crow::request& req, crow::response& res, context&) {
        if (req.method != crow::HTTPMethod::Options || req.url.rfind("/api/", 0) != 0) return;
        std::string reqOrigin = req.get_header_value("Origin");
        if (!isAllowedOrigin(reqOrigin, allowedOrigin)) {
            res.code = 403;
            return;
        }
        res.code = 204;
        res.set_header("Access-Control-Allow-Origin", reqOrigin);
        res.set_header("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.set_header("Access-Control-Allow-Headers", "Content-Type, x-crypto-symbol, x-crypto-network, x-crypto-tier");
        res.set_header("Vary", "Origin");
    }
};

int main(int argc, char* argv[]) {
    crow::App<CorsPreflight> app;

    uint16_t port = 18080;
    if (argc > 1) {
        try {
            port = static_cast<uint16_t>(std::stoi(argv[1]));
        } catch (...) {
            std::cerr << "Porta inválida fornecida via argumento: " << argv[1] << ", usando padrão 18080" << std::endl;
        }
    } else {
        const char* envPort = std::getenv("CROW_PORT");
        if (!envPort) envPort = std::getenv("PORT");
        if (envPort) {
            try {
                port = static_cast<uint16_t>(std::stoi(envPort));
            } catch (...) {
                std::cerr << "Porta inválida fornecida via env: " << envPort << ", usando padrão 18080" << std::endl;
            }
        }
    }

    // Origem permitida para CORS configurável via variável de ambiente (padrão: localhost:3000)
    const char* envOrigin = std::getenv("ALLOWED_ORIGIN");
    const std::string allowedOrigin = (envOrigin != nullptr && std::string(envOrigin).length() > 0)
        ? std::string(envOrigin)
        : "http://localhost:3000";
    app.get_middleware<CorsPreflight>().allowedOrigin = allowedOrigin;

    auto applySecurityHeaders = [&allowedOrigin, port](crow::response& res, const crow::request& req) {
        std::string reqOrigin = req.get_header_value("Origin");
        if (isAllowedOrigin(reqOrigin, allowedOrigin)) {
            res.add_header("Access-Control-Allow-Origin", reqOrigin);
            res.add_header("Access-Control-Allow-Methods", "GET, OPTIONS");
            res.add_header("Access-Control-Allow-Headers", "Content-Type, x-crypto-symbol, x-crypto-network, x-crypto-tier");
        }
        res.add_header("Vary", "Origin");
        res.add_header("X-Content-Type-Options", "nosniff");
        res.add_header("X-Frame-Options", "DENY");
        res.add_header("X-Backend-Instance", "crow-" + std::to_string(port));
    };

    // Rota raiz: status da API Crow e documentação rápida
    CROW_ROUTE(app, "/")
    ([&applySecurityHeaders, port](const crow::request& req) {
        crow::json::wvalue res;
        res["service"] = "Crow C++ Crypto API";
        res["status"] = "online";
        res["port"] = port;
        res["endpoints"] = std::vector<std::string>{
            "GET /api/value?coin=BTCUSDT",
            "GET /api/btc?coin=BTCUSDT",
            "GET /api/plot?coin=BTCUSDT",
            "GET /health"
        };
        crow::response response(200, res);
        applySecurityHeaders(response, req);
        return response;
    });

    // Healthcheck
    CROW_ROUTE(app, "/health")
    ([&applySecurityHeaders, port](const crow::request& req) {
        crow::json::wvalue res;
        res["status"] = "ok";
        res["port"] = port;
        crow::response response(200, res);
        applySecurityHeaders(response, req);
        return response;
    });

    // Endpoint que puxa dados via CPR diretamente da Binance com sanitização
    CROW_ROUTE(app, "/api/btc")
    ([&applySecurityHeaders](const crow::request& req) {
        std::string rawCoin = "BTCUSDT";
        if (req.url_params.get("coin") != nullptr) {
            rawCoin = req.url_params.get("coin");
        }
        std::string cleanCoin = crypto::sanitizeSymbol(rawCoin);
        std::string rawData = crypto::GETBTC(cleanCoin);

        crow::response response(200, rawData);
        response.set_header("Content-Type", "application/json");
        applySecurityHeaders(response, req);
        return response;
    });

    // Endpoint para requisição de valores, ticker e candlestick formatados para o dashboard
    CROW_ROUTE(app, "/api/value")
    ([&applySecurityHeaders](const crow::request& req) {
        std::string rawCoin = "BTCUSDT";

        if (req.url_params.get("coin") != nullptr) {
            rawCoin = req.url_params.get("coin");
        } else if (!req.get_header_value("x-crypto-symbol").empty()) {
            rawCoin = req.get_header_value("x-crypto-symbol");
        }

        std::string cleanCoin = crypto::sanitizeSymbol(rawCoin);
        crow::json::wvalue res = crypto::getCryptoResponse(cleanCoin);

        crow::response response(200, res);
        applySecurityHeaders(response, req);
        return response;
    });

    // Endpoint seguro que utiliza Matplot++ para gerar e retornar o gráfico solicitado
    CROW_ROUTE(app, "/api/plot")
    ([&applySecurityHeaders, port](const crow::request& req) {
        std::string rawCoin = "BTCUSDT";
        if (req.url_params.get("coin") != nullptr) {
            rawCoin = req.url_params.get("coin");
        }

        // Sanitização estrita: apenas caracteres alfanuméricos (impede path traversal)
        std::string cleanCoin = crypto::sanitizeSymbol(rawCoin);
        if (cleanCoin.length() > 12) {
            cleanCoin = cleanCoin.substr(0, 12);
        }

        std::string filename = "chart_" + cleanCoin + "_" + std::to_string(port) + ".png";
        bool success = crypto::generatePriceChart(cleanCoin, filename);

        if (!success) {
            crow::json::wvalue err;
            err["status"] = "error";
            err["message"] = "Erro ao renderizar gráfico com Matplot++";
            crow::response response(500, err);
            applySecurityHeaders(response, req);
            return response;
        }

        std::ifstream file(filename, std::ios::binary);
        if (!file.is_open()) {
            crow::json::wvalue err;
            err["status"] = "error";
            err["message"] = "Não foi possível abrir o arquivo gerado";
            crow::response response(500, err);
            applySecurityHeaders(response, req);
            return response;
        }

        std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
        file.close();

        crow::response response(200, content);
        response.set_header("Content-Type", "image/png");
        applySecurityHeaders(response, req);
        return response;
    });

    std::cout << "Servidor C++ Crow rodando na porta " << port << " (Origem permitida: " << allowedOrigin << ")..." << std::endl;
    app.port(port).multithreaded().run();

    return 0;
}
