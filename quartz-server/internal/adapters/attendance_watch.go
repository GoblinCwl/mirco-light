package adapters

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
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
	if quiet <= 0 {
		quiet = time.Minute
	}
	timer := time.NewTimer(0)
	defer timer.Stop()
	var done <-chan error
	defer func() {
		cancel()
		if done != nil {
			<-done
		}
	}()
	pending := true
	start := func() {
		result := make(chan error, 1)
		done = result
		pending = false
		go func() { result <- refresh(ctx) }()
	}
	for {
		select {
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
				timer.Reset(quiet)
			}
		case <-timer.C:
			if done == nil && pending {
				start()
			}
		case err := <-done:
			done = nil
			if err != nil {
				report(err)
			}
			if pending {
				timer.Reset(quiet)
			}
		}
	}
}
