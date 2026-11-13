package application

import (
	"context"
	"time"
)

// Sync completion and administrator edits invalidate video indexing. A single
// worker coalesces bursts and retries failed work without polling unchanged data.
func (r *Runtime) requestVideoIndex() {
	select {
	case r.videoIndexUpdates <- struct{}{}:
	default:
	}
}
func (r *Runtime) watchVideoIndex(root context.Context) {
	task := newEventTask("video-index", 60*time.Second, func(ctx context.Context) error { return r.syncSource(ctx, "video") })
	task.pending = r.videoIndexUpdates
	task.retryKey = "video-index-retry"
	task.run(root, r.app.Log)
}
