package cache

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCoalescingAndInvalidation(t *testing.T) {
	c := &Cache{}
	var calls atomic.Int64
	loader := func(context.Context) (map[string]any, error) {
		calls.Add(1)
		time.Sleep(10 * time.Millisecond)
		return map[string]any{"n": 1}, nil
	}
	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			value, err := c.Get(context.Background(), "same", time.Minute, false, loader)
			if err != nil || value["n"] != 1 {
				t.Error("load failed", err)
			}
			value["private-caller-field"] = true
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("duplicate upstream loads")
	}
	value, _ := c.Get(context.Background(), "same", time.Minute, false, loader)
	if value["private-caller-field"] != nil {
		t.Fatal("caller mutated cached map")
	}
	started, release := make(chan struct{}), make(chan struct{})
	oldDone := make(chan struct{})
	go func() {
		defer close(oldDone)
		c.Get(context.Background(), "changing", time.Minute, false, func(context.Context) (map[string]any, error) {
			close(started)
			<-release
			return map[string]any{"version": "old"}, nil
		})
	}()
	<-started
	c.Invalidate()
	value, err := c.Get(context.Background(), "changing", time.Minute, false, func(context.Context) (map[string]any, error) { return map[string]any{"version": "new"}, nil })
	if err != nil || value["version"] != "new" {
		t.Fatal("invalidated request reused old pending work")
	}
	close(release)
	<-oldDone
	value, _ = c.Get(context.Background(), "changing", time.Minute, false, loader)
	if value["version"] != "new" {
		t.Fatal("old response overwrote new cache")
	}
}

func TestLoaderPanicReleasesWaiters(t *testing.T) {
	c := &Cache{}
	if _, err := c.Get(context.Background(), "panic", time.Minute, false, func(context.Context) (map[string]any, error) { panic("fixture") }); err == nil {
		t.Fatal("loader panic ignored")
	}
	value, err := c.Get(context.Background(), "panic", time.Minute, false, func(context.Context) (map[string]any, error) { return map[string]any{"ok": true}, nil })
	if err != nil || value["ok"] != true {
		t.Fatal("panic left a stuck in-flight request")
	}
}
