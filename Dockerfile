# Multi-stage Dockerfile para rodar Next.js + Crow C++ microservice juntos
FROM node:22-bookworm-slim AS base

WORKDIR /app

# Instala dependências de build do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    clang \
    cmake \
    libboost-all-dev \
    gnuplot \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copia arquivos de pacotes
COPY package*.json ./
RUN npm ci

# Copia o restante do código fonte
COPY . .

# Compila o Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

EXPOSE 3000
EXPOSE 18080

CMD ["npm", "start"]
