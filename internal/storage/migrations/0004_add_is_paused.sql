-- +goose Up
-- +goose StatementBegin
ALTER TABLE business_connections ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE business_connections DROP COLUMN IF EXISTS is_paused;
-- +goose StatementEnd
