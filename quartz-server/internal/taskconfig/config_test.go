package taskconfig

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestConfigDefaultsValidationAndNotifications(t *testing.T) {
	c := New(nil)
	ctx := With(context.Background(), c)
	if Duration(ctx, "video-sync") != 6*time.Hour || c.Clock() != "06:00" {
		t.Fatal("defaults")
	}
	ch, stop := Watch(ctx, Key("video-sync"))
	defer stop()
	c.Reload(map[string]any{Key("video-sync"): float64(-1), "tasks.friendsTime": "25:00"})
	select {
	case <-ch:
		t.Fatal("invalid values must retain defaults without notification")
	default:
	}
	c.Reload(map[string]any{Key("video-sync"): float64(7200), "tasks.friendsTime": "09:45"})
	select {
	case <-ch:
	default:
		t.Fatal("missing update notification")
	}
	if Duration(ctx, "video-sync") != 2*time.Hour || c.Clock() != "09:45" {
		t.Fatal("reload")
	}
	// Schema and defaults must agree and every entry must be private.
	raw, _ := json.Marshal(Schema())
	var entries []map[string]any
	json.Unmarshal(raw, &entries)
	for _, entry := range entries {
		if entry["public"] != false {
			t.Fatal("task setting exposed publicly")
		}
	}
}
func TestTickerRearmsAndStops(t *testing.T) {
	c := New(map[string]any{Key("service-journal"): float64(3600)})
	ctx, cancel := context.WithCancel(With(context.Background(), c))
	defer cancel()
	tick := NewTicker(ctx, "service-journal")
	c.Reload(map[string]any{Key("service-journal"): float64(1)})
	select {
	case due := <-tick.C:
		if due.Nanosecond() != 0 {
			t.Fatal("not aligned to Cron", due)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("new period did not apply")
	}
	tick.Stop()
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.watchers) != 0 {
		t.Fatal("subscription leaked")
	}
}
func TestWaitWakesAndCancels(t *testing.T) {
	ctx, cancel := context.WithCancel(With(context.Background(), New(nil)))
	wake := make(chan struct{}, 1)
	wake <- struct{}{}
	if !Wait(ctx, "event-retry", wake) {
		t.Fatal("event did not wake retry")
	}
	cancel()
	if Wait(ctx, "event-retry", nil) {
		t.Fatal("canceled delay returned success")
	}
}
func TestObserverConfigAtomicExport(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "events", "task-config.json")
	if err := WriteObserver(filename, IntervalExpression(30), 30*time.Second); err != nil {
		t.Fatal(err)
	}
	seconds, err := ReadObserver(filename)
	if err != nil || seconds != IntervalExpression(30) {
		t.Fatal(seconds, err)
	}
	if err := os.WriteFile(filename, []byte(`{"intervalSeconds":0}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadObserver(filename); err == nil {
		t.Fatal("accepted invalid observer period")
	}
	if err := WriteObserver(filename, IntervalExpression(45), 45*time.Second); err != nil {
		t.Fatal(err)
	}
	seconds, err = ReadObserver(filename)
	if err != nil || seconds != IntervalExpression(45) {
		t.Fatal(seconds, err)
	}
}

func TestCronPreviewAndHourlyCountsUseSameOccurrences(t *testing.T) {
	day := time.Date(2026, time.November, 24, 0, 0, 0, 0, Beijing)
	for _, expression := range []string{"*/5 * * * * *", "10,40 8-17 * * MON-FRI", "0 6 * * *", "@every 7s", "@weekly"} {
		plan, err := Parse(expression)
		if err != nil {
			t.Fatal(err)
		}
		for _, hour := range []int{0, 6, 8, 23} {
			start := day.Add(time.Duration(hour) * time.Hour)
			end := start.Add(time.Hour)
			count := 0
			for occurrence := plan.Next(start.Add(-time.Second)); !occurrence.IsZero() && occurrence.Before(end); occurrence = plan.Next(occurrence) {
				count++
			}
			if got := plan.HourCount(start); got != count {
				t.Fatalf("%s %s: counted %d, want %d", expression, start, got, count)
			}
		}
	}
	for _, bad := range []string{"", "0 0 31 2 *", "0 90 * * *", "@every 500ms", "CRON_TZ=UTC 0 6 * * *"} {
		if _, err := Parse(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}
