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
	case <-tick.C:
		t.Fatal("configuration change must not execute immediately")
	case <-time.After(100 * time.Millisecond):
	}
	select {
	case <-tick.C:
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
	if err := WriteObserver(filename, 30*time.Second); err != nil {
		t.Fatal(err)
	}
	seconds, err := ReadObserver(filename)
	if err != nil || seconds != 30 {
		t.Fatal(seconds, err)
	}
	if err := os.WriteFile(filename, []byte(`{"intervalSeconds":0}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadObserver(filename); err == nil {
		t.Fatal("accepted invalid observer period")
	}
	if err := WriteObserver(filename, 45*time.Second); err != nil {
		t.Fatal(err)
	}
	seconds, err = ReadObserver(filename)
	if err != nil || seconds != 45 {
		t.Fatal(seconds, err)
	}
}
