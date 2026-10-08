use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickerSummary {
    pub price: f64,
    pub change_percent: f64,
    pub high: f64,
    pub low: f64,
    pub volume: f64,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct CandlePoint {
    pub time: i64,
    pub value: f64,
}

#[derive(Debug, Serialize)]
pub struct MarketCandle {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoResponse {
    pub status: &'static str,
    pub coin: String,
    pub source: &'static str,
    pub ticker: TickerSummary,
    pub chart_data: Vec<CandlePoint>,
    pub candles: Vec<MarketCandle>,
}
