package taskruns

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestExecutionTextRedactsCredentialsAndBoundsOutput(t *testing.T) {
	got := Clean("download https://user:pass@example.test/path?token=secret#fragment token=private password=word Authorization: Bearer credential-value", 500)
	for _, secret := range []string{"user:pass", "token=secret", "token=private", "password=word", "credential-value"} {
		if strings.Contains(got, secret) {
			t.Fatal("credential leaked", got)
		}
	}
	if !strings.Contains(got, "https://example.test/path") {
		t.Fatal(got)
	}
	if len([]rune(Clean(strings.Repeat("字", 600), 50))) > 51 {
		t.Fatal("unbounded execution log")
	}
}
func TestCoalescedQueueReportsWorkAndNewEventsSeparately(t *testing.T) {
	q := NewQueueState("文章索引")
	if len(q.Snapshot(0)) != 0 {
		t.Fatal("idle queue is not empty")
	}
	q.Start()
	items := q.Snapshot(1)
	if len(items) != 2 || items[0].State != "running" || items[1].State != "pending" {
		t.Fatal(items)
	}
	q.Retry(errors.New("upstream failed"), time.Minute)
	items = q.Snapshot(0)
	if len(items) != 1 || items[0].State != "retry" || items[0].Attempts != 1 || items[0].AvailableAt == "" {
		t.Fatal(items)
	}
	q.Done()
	if len(q.Snapshot(0)) != 0 {
		t.Fatal("completed work remained queued")
	}
}
func TestUntrackedExecutionDoesNotDependOnDatabase(t *testing.T) {
	expected := errors.New("fixture")
	if got := Run(context.Background(), "test", func(context.Context) error { return expected }); got != expected {
		t.Fatal(got)
	}
}
