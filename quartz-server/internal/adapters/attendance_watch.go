package adapters

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/fsnotify/fsnotify"
)

// WatchAttendance watches directories rather than individual files, so atomic
// editor saves remain observable. The callback is serialized and changes that
// arrive during a scan always trigger another scan after the quiet interval.
func WatchAttendance(ctx context.Context, root string, quiet time.Duration, refresh func(context.Context) error, report func(error)) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	defer watcher.Close()
	addTree := func(root string) error {
		return filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() {
				return watcher.Add(path)
			}
			return nil
		})
	}
	if err = addTree(root); err != nil {
		return err
	}
	_ = taskruns.Run(ctx, "attendance-watch", func(ctx context.Context) error { taskruns.Note(ctx, "日历目录监听已就绪"); return nil })
	if quiet <= 0 {
		quiet = time.Minute
	}
	delay := func() time.Duration {
		if taskconfig.From(ctx) != nil {
			return taskconfig.Duration(ctx, "attendance-quiet")
		}
		return quiet
	}
	changed, stop := taskconfig.Watch(ctx, taskconfig.Key("attendance-quiet"))
	defer stop()
	timer := time.NewTimer(0)
	defer timer.Stop()
	var done <-chan error
	defer func() {
		cancel()
		if done != nil {
			<-done
		}
	}()
	var pendingFlag atomic.Bool
	state := taskruns.NewQueueState("日历变更刷新")
	if tracker := taskruns.From(ctx); tracker != nil {
		tracker.RegisterQueue("attendance-refresh", func() []taskruns.QueueItem {
			pending := 0
			if pendingFlag.Load() {
				pending = 1
			}
			return state.Snapshot(pending)
		})
	}
	pendingFlag.Store(true)
	pending := true
	start := func() {
		result := make(chan error, 1)
		done = result
		pending = false
		pendingFlag.Store(false)
		state.Start()
		go func() { result <- taskruns.Run(ctx, "attendance-refresh", refresh) }()
	}
	for {
		select {
		case <-changed:
			if pending {
				timer.Reset(delay())
			}
		case <-ctx.Done():
			return nil
		case err, ok := <-watcher.Errors:
			if !ok {
				return errors.New("attendance watcher closed")
			}
			return err
		case event, ok := <-watcher.Events:
			if !ok {
				return errors.New("attendance watcher closed")
			}
			directory := false
			if event.Has(fsnotify.Create) {
				if stat, statErr := os.Lstat(event.Name); statErr == nil && stat.IsDir() {
					directory = true
					if err := addTree(event.Name); err != nil {
						report(err)
					}
				}
			}
			// Directory renames/removals can remove many dates in one event.
			if directory || event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) || strings.HasSuffix(event.Name, ".md") {
				pending = true
				pendingFlag.Store(true)
				timer.Reset(delay())
			}
		case <-timer.C:
			if done == nil && pending {
				start()
			}
		case err := <-done:
			done = nil
			state.Done()
			if err != nil {
				report(err)
			}
			if pending {
				timer.Reset(delay())
			}
		}
	}
}
