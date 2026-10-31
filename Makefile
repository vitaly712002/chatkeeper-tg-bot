# Короткие команды для разработки. Запуск: make <цель>

# Загружаем переменные из deploy/.env, если файл существует (для локального run).
ifneq (,$(wildcard deploy/.env))
include deploy/.env
export
endif

.PHONY: help
help: ## Показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

.PHONY: tidy
tidy: ## Привести go.mod/go.sum в порядок
	go mod tidy

.PHONY: generate
generate: ## Сгенерировать код из SQL (sqlc)
	sqlc generate

.PHONY: build
build: ## Собрать бинарник в ./bin/bot
	go build -o bin/bot ./cmd/bot

.PHONY: run
run: ## Запустить бота локально (нужен deploy/.env)
	go run ./cmd/bot

.PHONY: test
test: ## Прогнать тесты
	go test ./...

.PHONY: vet
vet: ## Статическая проверка go vet
	go vet ./...

.PHONY: db-up
db-up: ## Поднять локальную PostgreSQL в Docker
	docker compose -f deploy/docker-compose.dev.yml up -d

.PHONY: db-down
db-down: ## Остановить локальную PostgreSQL
	docker compose -f deploy/docker-compose.dev.yml down

.PHONY: deploy
deploy: ## Собрать и запустить прод-стек (нужна сеть: docker network create web)
	cd deploy && docker compose -p chatkeeper --env-file .env up -d --build

.PHONY: genkey
genkey: ## Сгенерировать новый ключ шифрования (ENCRYPTION_KEY)
	@openssl rand -hex 32
