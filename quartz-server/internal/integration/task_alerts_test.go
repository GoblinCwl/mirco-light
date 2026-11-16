package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/settings"
	"goblincwl/quartz-server/internal/taskruns"
	"strings"
	"testing"
)

func TestTaskAndQueueFailuresAlertAndNotify(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	cfg := settings.Store{DB: db}
	if _, err := cfg.Save(ctx, "notify.astrbot.enabled", true); err != nil {
		t.Fatal(err)
	}
	tracker := taskruns.New(db)
	alerts.TrackFailures(tracker)
	ctx = taskruns.With(ctx, tracker)
	for _, key := range []string{"index-share", "friend-jobs"} {
		for i := 0; i < 2; i++ {
			if err := taskruns.Run(ctx, key, func(context.Context) error {
				return errors.New("fixture token=secret-value https://example.test/path?api_key=private")
			}); err == nil {
				t.Fatal("lost error")
			}
		}
	}
	result, err := (alerts.Store{DB: db}).List(ctx, 1, "task", "")
	if err != nil {
		t.Fatal(err)
	}
	records := result["records"].([]alerts.Record)
	if len(records) != 2 {
		t.Fatal("task alerts hidden", len(records))
	}
	for _, r := range records {
		if r.Occurrences != 2 || strings.Contains(r.Message, "secret-value") || strings.Contains(r.Message, "api_key=private") {
			t.Fatal("alert repeats or secrets", r)
		}
	}
	var count int
	db.QueryRow("SELECT count(*) FROM notification_outbox WHERE kind='alerts'").Scan(&count)
	if count != 2 {
		t.Fatal("notification missing or duplicated", count)
	}
	taskruns.Run(ctx, "index-share", func(context.Context) error { return context.Canceled })
	taskruns.Run(ctx, "index-share", func(context.Context) error { return nil })
	runKey := "external-fixture"
	external := taskruns.RunRecord{RunKey: &runKey, Status: "failed", Error: "observer failed", StartedAt: "2026-11-16T00:00:00Z", FinishedAt: "2026-11-16T00:00:01Z"}
	for i := 0; i < 2; i++ {
		if err := tracker.Import(ctx, "container-observer", external); err != nil {
			t.Fatal(err)
		}
	}
	db.QueryRow("SELECT count(*) FROM notification_outbox WHERE kind='alerts'").Scan(&count)
	if count != 3 {
		t.Fatal("external task duplicated or canceled task alerted", count)
	}
}
