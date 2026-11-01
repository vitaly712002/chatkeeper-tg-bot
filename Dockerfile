# --- Этап 1: сборка веб-панели (React/Vite) ---
FROM node:20-alpine AS web
WORKDIR /web
# Сначала манифесты — чтобы слой с npm ci кешировался.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # результат -> /web/dist

# --- Этап 2: сборка бота (Go) ---
FROM golang:1.26-alpine AS builder
WORKDIR /src
# Кешируемый слой зависимостей.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# CGO_ENABLED=0 -> статический бинарник для distroless.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bot ./cmd/bot
RUN mkdir -p /data/media && chown -R 65532:65532 /data

# --- Этап 3: финальный образ ---
# distroless: без shell и лишних пакетов; :nonroot -> запуск не от root.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /bot /bot
# Собранная веб-панель; путь совпадает с WEB_DIR по умолчанию ниже.
COPY --from=web /web/dist /web
COPY --from=builder --chown=65532:65532 /data /data

# Папка для сохранённых медиа (должна совпадать с MEDIA_DIR).
VOLUME ["/data"]

# По умолчанию внутри контейнера панель раздаётся из /web.
ENV WEB_DIR=/web

ENTRYPOINT ["/bot"]
