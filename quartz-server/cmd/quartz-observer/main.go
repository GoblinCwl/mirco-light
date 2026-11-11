package main

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/observer"
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
	ticker := time.NewTicker(10 * time.Second)
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
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}
