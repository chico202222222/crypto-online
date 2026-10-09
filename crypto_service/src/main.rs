mod binance;
mod chart;
mod models;

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use reqwest::Client;
use serde_json::{json, Value};
use std::{collections::HashMap, env, time::Duration};
use tower_http::cors::{AllowOrigin, CorsLayer};

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
        "service": "Rust Crypto API",
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
        .unwrap_or_else(|_| json!({ "error": "upstream_unavailable" }));
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
    let (ticker, source) = match binance::fetch_ticker(&state.client, &coin).await {
        Ok(ticker) => (ticker, "binance-ticker-synthetic-series"),
        Err(_) => (binance::fallback_ticker(&coin), "simulated"),
    };
    Json(binance::build_response(coin, ticker, count, source))
}

async fn plot(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let coin = symbol(&params, None);
    let (ticker, source) = match binance::fetch_ticker(&state.client, &coin).await {
        Ok(ticker) => (ticker, "binance-ticker-synthetic-series"),
        Err(_) => (binance::fallback_ticker(&coin), "simulated"),
    };
    let response = binance::build_response(coin.clone(), ticker, 24, source);
    match chart::generate_price_chart_png(&coin, &response.chart_data, source == "simulated") {
        Ok(png) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "image/png"),
                (HeaderName::from_static("x-data-source"), source),
            ],
            png,
        )
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "status": "error", "message": err })),
        )
            .into_response(),
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
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let port: u16 = env::args()
        .nth(1)
        .or_else(|| env::var("RUST_PORT").ok())
        .unwrap_or_else(|| "18080".into())
        .parse()?;
    let client = Client::builder().timeout(Duration::from_secs(3)).build()?;
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    println!("Rust Crypto API ouvindo na porta {port}");
    axum::serve(listener, router(AppState { client, port })).await?;
    Ok(())
}
