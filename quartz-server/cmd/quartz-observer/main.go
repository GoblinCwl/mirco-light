package main

import (
	"context"
	"errors"
	"github.com/fsnotify/fsnotify"
	"goblincwl/quartz-server/internal/observer"
	"goblincwl/quartz-server/internal/taskconfig"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		slog.Error("observer stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	directory := os.Getenv("QUARTZ_JOURNAL_DIR")
	if directory == "" {
		directory = "/home/goblincwl/docker/quartz4/runtime/chronicle"
	}
	filename := filepath.Join(directory, "observer-state.json")
	snapshot, err := observer.Read(filename)
	baseline := false
	if errors.Is(err, os.ErrNotExist) {
		snapshot = observer.Snapshot{States: map[string]observer.State{}, Events: []observer.Event{}}
		baseline = true
	} else if err != nil {
		return err
	}
	config := taskconfig.New(nil)
	ctx = taskconfig.With(ctx, config)
	configFile := filepath.Join(filepath.Dir(directory), "events", "task-config.json")
	reload := func() {
		seconds, err := taskconfig.ReadObserver(configFile)
		if err == nil {
			config.Reload(map[string]any{taskconfig.Key("container-observer"): seconds})
		} else if !errors.Is(err, os.ErrNotExist) {
			slog.Warn("observer task configuration unavailable; retaining previous interval")
		}
	}
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer watcher.Close()
	if err = watcher.Add(filepath.Dir(configFile)); err != nil {
		return err
	}
	reload()
	ticker := taskconfig.NewTicker(ctx, "container-observer")
	defer ticker.Stop()
	for {
		containers, err := observer.Inspect(ctx)
		if err == nil {
			observer.Update(&snapshot, containers, baseline, func(container observer.Container) bool { return observer.Ready(ctx, container, directory) }, time.Now())
			if err = observer.Save(filename, snapshot); err != nil {
				return err
			}
			baseline = false
		} else if ctx.Err() == nil {
			slog.Warn("container observation unavailable; preserving state")
		}
	wait:
		for {
			select {
			case <-ctx.Done():
				return nil
			case event, ok := <-watcher.Events:
				if !ok {
					return errors.New("observer config watcher closed")
				}
				if filepath.Clean(event.Name) == filepath.Clean(configFile) {
					reload()
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return errors.New("observer config watcher closed")
				}
				slog.Warn("observer config watch failed", "error", err)
			case <-ticker.C:
				break wait
			}
		}
	}
}
