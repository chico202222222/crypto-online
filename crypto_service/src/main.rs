mod binance;
mod chart;
mod models;

use axum::{
    extract::{Query, Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use reqwest::Client;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::Instrument;

#[derive(Clone)]
struct AppState {
    client: Client,
    port: u16,
}

fn symbol(params: &HashMap<String, String>, headers: Option<&HeaderMap>) -> String {
    let raw = params
        .get("coin")
        .map(String::as_str)
        .or_else(|| {
            headers
                .and_then(|map| map.get("x-crypto-symbol"))?
                .to_str()
                .ok()
        })
        .unwrap_or("BTCUSDT");
    binance::sanitize_symbol(raw)
}

async fn root(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "service": "Mercury API",
        "status": "online",
        "port": state.port,
        "endpoints": [
            "GET /api/value?coin=BTCUSDT",
            "GET /api/btc?coin=BTCUSDT",
            "GET /api/plot?coin=BTCUSDT",
            "GET /health"
        ]
    }))
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({ "status": "ok", "port": state.port }))
}

async fn btc(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Json<Value> {
    let coin = symbol(&params, None);
    let data = binance::fetch_raw(&state.client, &coin)
        .await
        .unwrap_or_else(|err| {
            tracing::warn!(coin = %coin, error = %err, "raw ticker unavailable");
            json!({ "error": "upstream_unavailable" })
        });
    Json(data)
}

async fn value(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Json<models::CryptoResponse> {
    let coin = symbol(&params, Some(&headers));
    let count = params
        .get("count")
        .and_then(|raw| raw.parse::<isize>().ok())
        .unwrap_or(72)
        .clamp(12, 240) as usize;
    let interval = params
        .get("interval")
        .map(String::as_str)
        .unwrap_or("1h");

    let klines_res = binance::fetch_klines(&state.client, &coin, interval, count).await;
    let ticker_res = binance::fetch_ticker(&state.client, &coin).await;

    let response = match (klines_res, ticker_res) {
        (Ok(candles), Ok(ticker)) => {
            binance::build_response_with_candles(coin, ticker, candles, "binance-spot-real")
        }
        (Ok(candles), Err(err)) => {
            tracing::warn!(coin = %coin, error = %err, "ticker failed; deriving ticker from klines");
            let ticker = binance::ticker_from_candles(&candles);
            binance::build_response_with_candles(coin, ticker, candles, "binance-klines")
        }
        (Err(err), Ok(ticker)) => {
            tracing::warn!(coin = %coin, error = %err, "klines failed; synthesizing series from ticker");
            binance::build_response(coin, ticker, count, "binance-ticker-synthetic-series")
        }
        (Err(klines_err), Err(ticker_err)) => {
            tracing::error!(coin = %coin, klines_error = %klines_err, ticker_error = %ticker_err, "all upstreams failed; serving simulated data");
            let ticker = binance::fallback_ticker(&coin);
            binance::build_response(coin, ticker, count, "simulated")
        }
    };
    Json(response)
}

async fn plot(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let coin = symbol(&params, None);
    let interval = params
        .get("interval")
        .map(String::as_str)
        .unwrap_or("1h");
    let count = 24;

    let klines_res = binance::fetch_klines(&state.client, &coin, interval, count).await;
    let ticker_res = binance::fetch_ticker(&state.client, &coin).await;

    let (points, is_simulated, source_label) = match (klines_res, ticker_res) {
        (Ok(candles), _) => {
            let pts: Vec<models::CandlePoint> = candles
                .iter()
                .map(|c| models::CandlePoint {
                    time: c.time,
                    value: c.close,
                })
                .collect();
            (pts, false, "binance-spot-real")
        }
        (Err(err), Ok(ticker)) => {
            tracing::warn!(coin = %coin, error = %err, "klines failed; synthesizing chart from ticker");
            let resp = binance::build_response(coin.clone(), ticker, count, "binance-ticker-synthetic-series");
            (resp.chart_data, false, "binance-ticker-synthetic")
        }
        (Err(klines_err), Err(ticker_err)) => {
            tracing::error!(coin = %coin, klines_error = %klines_err, ticker_error = %ticker_err, "all upstreams failed; plotting simulated data");
            let ticker = binance::fallback_ticker(&coin);
            let resp = binance::build_response(coin.clone(), ticker, count, "simulated");
            (resp.chart_data, true, "simulated")
        }
    };

    match chart::generate_price_chart_png(&coin, &points, is_simulated) {
        Ok(png) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "image/png"),
                (HeaderName::from_static("x-data-source"), source_label),
            ],
            png,
        )
            .into_response(),
        Err(err) => {
            tracing::error!(coin = %coin, error = %err, "chart rendering failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "status": "error", "message": err })),
            )
                .into_response()
        }
    }
}

const REQUEST_ID_HEADER: &str = "x-request-id";
static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Aceita apenas ids curtos e seguros (8-64 chars: alfanumérico, `-`, `_`, `.`),
/// evitando injeção de quebras de linha/lixo nos logs.
fn valid_request_id(raw: &str) -> bool {
    (8..=64).contains(&raw.len())
        && raw
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
}

fn new_request_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("rs{:x}-{:x}-{:x}", std::process::id(), nanos, seq)
}

/// Reaproveita o `x-request-id` vindo do Next/Nginx (se válido) ou gera um novo,
/// anexa ao span da requisição, devolve no response e registra uma linha de acesso.
/// A query string não é registrada.
async fn request_log(mut request: Request, next: Next) -> Response {
    let request_id = request
        .headers()
        .get(REQUEST_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .filter(|v| valid_request_id(v))
        .map(str::to_owned)
        .unwrap_or_else(new_request_id);
    let header_value = HeaderValue::from_str(&request_id).expect("request id is ascii");
    request
        .headers_mut()
        .insert(HeaderName::from_static(REQUEST_ID_HEADER), header_value.clone());

    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let start = Instant::now();
    let span = tracing::info_span!("request", request_id = %request_id);

    let mut response = async {
        let response = next.run(request).await;
        let status = response.status().as_u16();
        let latency_ms = start.elapsed().as_millis() as u64;
        if status >= 500 {
            tracing::error!(%method, %path, status, latency_ms, "request");
        } else if status >= 400 {
            tracing::warn!(%method, %path, status, latency_ms, "request");
        } else if path == "/health" {
            tracing::debug!(%method, %path, status, latency_ms, "request");
        } else {
            tracing::info!(%method, %path, status, latency_ms, "request");
        }
        response
    }
    .instrument(span)
    .await;

    response
        .headers_mut()
        .insert(HeaderName::from_static(REQUEST_ID_HEADER), header_value);
    response
}

fn init_tracing() {
    use tracing_subscriber::{fmt, EnvFilter};
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let json = env::var("RUST_LOG_FORMAT")
        .map(|v| v.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    let builder = fmt().with_env_filter(filter);
    if json {
        builder.json().init();
    } else {
        builder.compact().init();
    }
}

fn router(state: AppState) -> Router {
    let mut explicit_origins: Vec<String> = vec![
        "http://localhost:3000".to_string(),
        "http://localhost:3001".to_string(),
        "http://127.0.0.1:3000".to_string(),
        "http://127.0.0.1:3001".to_string(),
    ];

    let env_origins = env::var("ALLOWED_ORIGIN")
        .or_else(|_| env::var("ALLOWED_ORIGINS"))
        .unwrap_or_default();

    let allow_all = env_origins.trim() == "*";

    if !allow_all && !env_origins.is_empty() {
        for part in env_origins.split(',') {
            let trimmed = part.trim();
            if !trimmed.is_empty() {
                explicit_origins.push(trimmed.to_string());
            }
        }
    }

    let cors = if allow_all || env_origins.contains('*') {
        CorsLayer::new()
            .allow_origin(AllowOrigin::any())
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS, Method::HEAD])
            .allow_headers(tower_http::cors::Any)
    } else {
        CorsLayer::new()
            .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
                if let Ok(s) = origin.to_str() {
                    let is_local = s == "http://localhost"
                        || s.starts_with("http://localhost:")
                        || s == "https://localhost"
                        || s.starts_with("https://localhost:")
                        || s == "http://127.0.0.1"
                        || s.starts_with("http://127.0.0.1:")
                        || s == "https://127.0.0.1"
                        || s.starts_with("https://127.0.0.1:")
                        || s == "http://0.0.0.0"
                        || s.starts_with("http://0.0.0.0:");
                    if is_local || explicit_origins.iter().any(|o| o == s) {
                        return true;
                    }
                }
                false
            }))
            .allow_methods([Method::GET, Method::POST, Method::OPTIONS, Method::HEAD])
            .allow_headers(tower_http::cors::Any)
    };
    let port = state.port;
    Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/api/btc", get(btc))
        .route("/api/value", get(value))
        .route("/api/plot", get(plot))
        .with_state(state)
        .layer(cors)
        .layer(axum::middleware::from_fn(
            move |request: axum::extract::Request, next: axum::middleware::Next| async move {
                let mut response = next.run(request).await;
                let headers = response.headers_mut();
                headers.insert(
                    header::X_CONTENT_TYPE_OPTIONS,
                    HeaderValue::from_static("nosniff"),
                );
                headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
                headers.insert(
                    HeaderName::from_static("x-backend-instance"),
                    HeaderValue::from_str(&format!("rust-{port}")).unwrap(),
                );
                response
            },
        ))
        .layer(axum::middleware::from_fn(request_log))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    init_tracing();
    let port: u16 = env::args()
        .nth(1)
        .or_else(|| env::var("RUST_PORT").ok())
        .unwrap_or_else(|| "18080".into())
        .parse()?;
    let client = Client::builder().timeout(Duration::from_secs(3)).build()?;
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!(port, "Mercury API ouvindo");
    axum::serve(listener, router(AppState { client, port })).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_request_id_accepts_safe_ids_only() {
        assert!(valid_request_id("test-req-12345"));
        assert!(valid_request_id("a.b_c-d1234"));
        assert!(!valid_request_id("short"));
        assert!(!valid_request_id(&"a".repeat(65)));
        assert!(!valid_request_id("bad id with spaces"));
        assert!(!valid_request_id("inject-12345\nforged"));
    }

    #[test]
    fn generated_request_ids_are_valid_and_unique() {
        let a = new_request_id();
        let b = new_request_id();
        assert!(valid_request_id(&a), "{a}");
        assert_ne!(a, b);
    }
}
