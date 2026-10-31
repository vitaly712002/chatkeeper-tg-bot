# --- Этап 1: сборка ---
# Собираем статический бинарник в полном образе с Go.
FROM golang:1.26-alpine AS builder

WORKDIR /src

# Сначала копируем только файлы модулей и качаем зависимости — так Docker
# закеширует этот слой и не будет перекачивать всё при каждом изменении кода.
COPY go.mod go.sum ./
RUN go mod download

# Теперь копируем исходники и собираем.
COPY . .
# CGO_ENABLED=0 -> полностью статический бинарник без внешних библиотек,
# чтобы он запускался в минимальном distroless-образе.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bot ./cmd/bot

# --- Этап 2: запуск ---
# distroless: крошечный образ без shell и лишних пакетов -> меньше уязвимостей.
# :nonroot -> контейнер работает не от root (безопаснее).
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /bot /bot

# Папка для сохранённых медиа (должна совпадать с MEDIA_DIR).
VOLUME ["/data"]

ENTRYPOINT ["/bot"]
