-- +goose Up
-- +goose StatementBegin

-- Колонка отмечает, что сообщение было удалено собеседником (и когда).
-- Раньше удаление только слалось алертом; теперь храним факт, чтобы
-- показывать удалённые прямо в ленте веб-панели.
ALTER TABLE tracked_messages ADD COLUMN deleted_at TIMESTAMPTZ;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE tracked_messages DROP COLUMN deleted_at;
-- +goose StatementEnd
