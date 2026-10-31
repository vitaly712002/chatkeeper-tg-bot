package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/vitaly/chatkeeper-tg-bot/internal/storage"
)

// Cleaner — фоновый воркер, который периодически удаляет старые сообщения,
// чтобы база не росла бесконечно (TTL = time to live, "время жизни").
type Cleaner struct {
	store    *storage.Store
	ttl      time.Duration
	interval time.Duration
	log      *slog.Logger
}

// NewCleaner создаёт воркер. ttlDays — через сколько дней удалять сообщения,
// interval — как часто проверять.
func NewCleaner(store *storage.Store, ttlDays int, interval time.Duration, log *slog.Logger) *Cleaner {
	return &Cleaner{
		store:    store,
		ttl:      time.Duration(ttlDays) * 24 * time.Hour,
		interval: interval,
		log:      log,
	}
}

// Run запускает бесконечный цикл чистки. Останавливается, когда отменяют ctx
// (например, при завершении программы). Вызывать в отдельной горутине.
func (c *Cleaner) Run(ctx context.Context) {
	// Чистим сразу при старте, потом — по таймеру.
	c.runOnce(ctx)

	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			c.log.Info("cleaner остановлен")
			return
		case <-ticker.C:
			c.runOnce(ctx)
		}
	}
}

func (c *Cleaner) runOnce(ctx context.Context) {
	cutoff := time.Now().Add(-c.ttl)
	n, err := c.store.DeleteOldMessages(ctx, pgtype.Timestamptz{Time: cutoff, Valid: true})
	if err != nil {
		c.log.Error("не удалось удалить старые сообщения", "err", err)
		return
	}
	if n > 0 {
		c.log.Info("TTL-очистка выполнена", "удалено", n, "старше", cutoff.Format(time.RFC3339))
	}
}
