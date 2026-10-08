use crate::models::{CandlePoint, CryptoResponse, MarketCandle, TickerSummary};
use chrono::Utc;
use reqwest::Client;
use serde_json::Value;

pub fn sanitize_symbol(raw: &str) -> String {
    let clean: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(20)
        .map(|c| c.to_ascii_uppercase())
        .collect();
    if clean.is_empty() {
        "BTCUSDT".into()
    } else {
        clean
    }
}

pub async fn fetch_raw(client: &Client, symbol: &str) -> Result<Value, String> {
    let base =
        std::env::var("BINANCE_BASE_URL").unwrap_or_else(|_| "https://api.binance.com".into());
    let response = client
        .get(format!("{}/api/v3/ticker/24hr", base.trim_end_matches('/')))
        .query(&[("symbol", symbol)])
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Binance HTTP {}", response.status()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|err| err.to_string())
}

fn number(data: &Value, key: &str) -> Option<f64> {
    let value = data.get(key)?;
    let number = value.as_str()?.parse::<f64>().ok()?;
    number.is_finite().then_some(number)
}

pub async fn fetch_ticker(client: &Client, symbol: &str) -> Result<TickerSummary, String> {
    let data = fetch_raw(client, symbol).await?;
    Ok(TickerSummary {
        price: number(&data, "lastPrice").ok_or("Binance lastPrice inválido")?,
        change_percent: number(&data, "priceChangePercent")
            .ok_or("Binance priceChangePercent inválido")?,
        high: number(&data, "highPrice").ok_or("Binance highPrice inválido")?,
        low: number(&data, "lowPrice").ok_or("Binance lowPrice inválido")?,
        volume: number(&data, "volume").ok_or("Binance volume inválido")?,
    })
}

pub fn fallback_ticker(symbol: &str) -> TickerSummary {
    let (price, change_percent, high, low, volume) = if symbol.contains("BTC") {
        (68420.50, 2.45, 69200.0, 67100.0, 28410.5)
    } else if symbol.contains("ETH") {
        (3520.10, -1.15, 3610.0, 3470.0, 152300.0)
    } else if symbol.contains("SOL") {
        (178.40, 5.80, 182.50, 169.20, 945200.0)
    } else if symbol.contains("BNB") {
        (592.30, 0.85, 598.0, 585.50, 43210.0)
    } else {
        (100.0, 0.0, 105.0, 95.0, 1000.0)
    };
    TickerSummary {
        price,
        change_percent,
        high,
        low,
        volume,
    }
}

pub fn build_response(
    symbol: String,
    ticker: TickerSummary,
    count: usize,
    source: &'static str,
) -> CryptoResponse {
    let now = Utc::now().timestamp();
    let chart_data: Vec<CandlePoint> = (0..count)
        .rev()
        .map(|i| CandlePoint {
            time: now - (i as i64 * 3600),
            value: ticker.price + (i as f64 * 0.5).sin() * ticker.price * 0.015,
        })
        .collect();
    let candles = chart_data
        .iter()
        .enumerate()
        .map(|(i, point)| {
            let open = if i == 0 {
                point.value
            } else {
                chart_data[i - 1].value
            };
            let close = point.value;
            let padding = ((close - open).abs() * 0.35).max(close * 0.001);
            MarketCandle {
                time: point.time,
                open,
                high: open.max(close) + padding,
                low: open.min(close) - padding,
                close,
                volume: (if ticker.volume > 0.0 {
                    ticker.volume
                } else {
                    5000.0
                }) / count as f64,
            }
        })
        .collect();
    CryptoResponse {
        status: "success",
        coin: symbol,
        source,
        ticker,
        chart_data,
        candles,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_symbol_and_limits_length() {
        assert_eq!(sanitize_symbol("../btC-uSdt!!!"), "BTCUSDT");
        assert_eq!(sanitize_symbol("***"), "BTCUSDT");
        assert_eq!(
            sanitize_symbol("abcdefghijklmnopqrstuv"),
            "ABCDEFGHIJKLMNOPQRST"
        );
    }

    #[test]
    fn response_matches_dashboard_shape() {
        let response = build_response(
            "BTCUSDT".into(),
            fallback_ticker("BTCUSDT"),
            12,
            "simulated",
        );
        let json = serde_json::to_value(response).unwrap();
        assert_eq!(json["chartData"].as_array().unwrap().len(), 12);
        assert_eq!(json["candles"].as_array().unwrap().len(), 12);
        assert_eq!(json["ticker"]["changePercent"], 2.45);
        assert_eq!(json["source"], "simulated");
    }
}
