# Multi-stage Dockerfile para Railway / Cloud Containers
FROM node:22-bookworm-slim AS base

WORKDIR /app

# Instala ferramentas do sistema para compilação e execução
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    clang \
    cmake \
    libboost-all-dev \
    libcpr-dev \
    gnuplot \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copia e instala dependências do Node.js
COPY package*.json ./
RUN npm ci

# Copia código fonte do projeto
COPY . .

# Compila o microserviço C++ Crow
RUN cd cryptoRequestSchema && (make || true)

# Compila o Next.js para produção
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Permissão para o script de inicialização
RUN chmod +x scripts/start-production.sh

# Portas de serviço
EXPOSE 3000
EXPOSE 18080

# Inicializa Crow C++ (:18080) e Next.js ($PORT)
CMD ["./scripts/start-production.sh"]
