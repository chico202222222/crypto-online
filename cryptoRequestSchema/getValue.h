#ifndef GET_VALUE_H
#define GET_VALUE_H

#include <crow.h>
#include <matplot/matplot.h>
#include <string>
#include <vector>

namespace crypto {

struct CandlePoint {
  long long time;
  double value;
};

struct TickerSummary {
  double price;
  double changePercent;
  double high;
  double low;
  double volume;
};

// Requisição HTTP via CPR para consultar valores da Binance
std::string GETBTC(const std::string &symbol = "BTCUSDT");

// Obter resumo de ticker para uma criptomoeda (ex: BTCUSDT, ETHUSDT)
TickerSummary getTicker(const std::string &symbol);

// Obter histórico de candles/pontos de preço
std::vector<CandlePoint> getCandleData(const std::string &symbol,
                                       int count = 72);

// Formatar dados como resposta JSON compatível com o Crow
crow::json::wvalue getCryptoResponse(const std::string &symbol, int count = 72);

// Gerar gráfico visual de preços usando Matplot++ e salvar como imagem
bool generatePriceChart(const std::string &symbol,
                        const std::string &outputPath = "crypto_chart.png");

// Sanitização de entradas para prevenir path traversal ou injeção
std::string sanitizeSymbol(const std::string &raw);

} // namespace crypto

#endif // GET_VALUE_H
