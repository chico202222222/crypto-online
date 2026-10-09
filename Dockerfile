FROM rust:bookworm AS rust-builder

WORKDIR /build
COPY crypto_service ./crypto_service
RUN cargo build --release --locked --manifest-path crypto_service/Cargo.toml

FROM node:22-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
COPY --from=rust-builder /build/crypto_service/target/release/crypto-server ./crypto_service/target/release/crypto-server
RUN chmod +x ./crypto_service/target/release/crypto-server scripts/start-production.sh

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

EXPOSE 3000 18080
CMD ["./scripts/start-production.sh"]
