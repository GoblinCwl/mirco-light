package taskruns

import (
	"context"
	"database/sql"
	"errors"
	_ "modernc.org/sqlite"
	"path/filepath"
	"testing"
)

func TestRetryOnlyFailedTasksAndCoalescesPending(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "runs.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE task_runs(id INTEGER PRIMARY KEY,task_key TEXT,run_key TEXT,started_at TEXT,finished_at TEXT,status TEXT,duration_ms INTEGER,error TEXT,logs TEXT)`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO task_runs VALUES(1,'index-repo',NULL,'2026-11-14','','failed',0,'failure','')`)
	if err != nil {
		t.Fatal(err)
	}
	tracker := New(db)
	calls := 0
	tracker.RegisterRetry("index-repo", func(context.Context) error { calls++; return nil })
	ctx := context.Background()
	if err := tracker.Retry(ctx, "index-repo"); err != nil {
		t.Fatal(err)
	}
	if err := tracker.Retry(ctx, "index-repo"); !errors.Is(err, ErrRetryPending) {
		t.Fatal(err)
	}
	if calls != 1 || tracker.canRetry("index-repo") {
		t.Fatal("duplicate retry", calls)
	}
	tracker.mu.Lock()
	delete(tracker.retryPending, "index-repo")
	tracker.mu.Unlock()
	for _, status := range []string{"running", "success"} {
		db.Exec("UPDATE task_runs SET status=?", status)
		if err := tracker.Retry(ctx, "index-repo"); !errors.Is(err, ErrRetryUnavailable) {
			t.Fatal(status, err)
		}
	}
	db.Exec("UPDATE task_runs SET status='interrupted'")
	tracker.RegisterRetry("index-repo", func(context.Context) error { return errors.New("enqueue failed") })
	if err := tracker.Retry(ctx, "index-repo"); err == nil {
		t.Fatal("accepted failed enqueue")
	}
	tracker.RegisterRetry("index-repo", func(context.Context) error { return nil })
	if err := tracker.Retry(ctx, "index-repo"); err != nil {
		t.Fatal("enqueue failure reserved task", err)
	}
	tracker.mu.Lock()
	delete(tracker.retryPending, "index-repo")
	tracker.mu.Unlock()
	wake := tracker.RetrySignal("index-repo")
	if err := tracker.Retry(ctx, "index-repo"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-wake:
	default:
		t.Fatal("worker not notified")
	}
	if err := Run(With(ctx, tracker), "index-repo", func(context.Context) error {
		if err := tracker.Retry(ctx, "index-repo"); !errors.Is(err, ErrRetryPending) {
			t.Fatal("running task accepted retry", err)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := tracker.Retry(ctx, "index-repo"); !errors.Is(err, ErrRetryUnavailable) {
		t.Fatal("successful retry accepted another retry", err)
	}
	if err := tracker.Retry(ctx, "unknown"); !errors.Is(err, ErrRetryUnavailable) {
		t.Fatal(err)
	}
}
