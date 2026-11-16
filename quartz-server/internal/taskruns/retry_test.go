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

func TestTriggerAllowsNeverRunAndSuccessfulTasksWithoutOverlapping(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "manual.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`CREATE TABLE task_runs(id INTEGER PRIMARY KEY,task_key TEXT,run_key TEXT,started_at TEXT,finished_at TEXT,status TEXT,duration_ms INTEGER,error TEXT,logs TEXT)`); err != nil {
		t.Fatal(err)
	}
	tracker := New(db)
	calls := 0
	tracker.RegisterRetry("index-repo", func(context.Context) error { calls++; return nil })
	ctx := With(context.Background(), tracker)
	if err = tracker.Trigger(ctx, "index-repo"); err != nil {
		t.Fatal("never-run trigger rejected", err)
	}
	if err = tracker.Trigger(ctx, "index-repo"); !errors.Is(err, ErrRetryPending) {
		t.Fatal("duplicate trigger accepted", err)
	}
	if err = Run(ctx, "index-repo", func(context.Context) error {
		if e := tracker.Trigger(ctx, "index-repo"); !errors.Is(e, ErrRetryPending) {
			t.Fatal("overlapping trigger", e)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err = tracker.Retry(ctx, "index-repo"); !errors.Is(err, ErrRetryUnavailable) {
		t.Fatal("retry allowed successful task", err)
	}
	if err = tracker.Trigger(ctx, "index-repo"); err != nil || calls != 2 {
		t.Fatal("successful task could not trigger", calls, err)
	}
	if err = tracker.Trigger(ctx, "unknown"); err == nil {
		t.Fatal("unknown task triggered")
	}
}

func TestHealthyRecoveryRequiresExplicitManualHandler(t *testing.T) {
	tracker := New(nil)
	tracker.RegisterRetry("friend-recovery", func(context.Context) error {
		t.Fatal("healthy recovery triggered through failure-only hook")
		return nil
	})
	if tracker.canTrigger("friend-recovery") {
		t.Fatal("failure-only recovery exposed as manually runnable")
	}
	if err := tracker.Trigger(context.Background(), "friend-recovery"); !errors.Is(err, ErrTriggerUnavailable) {
		t.Fatal(err)
	}
}
