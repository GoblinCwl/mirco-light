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
	for {
		select {
		case <-root.Done():
			return
		case <-r.videoIndexUpdates:
		}
		for {
			ctx, cancel := context.WithTimeout(root, 60*time.Second)
			err := r.syncSource(ctx, "video")
			cancel()
			if err == nil {
				break
			}
			if root.Err() != nil {
				return
			}
			r.app.Log.Warn("video index refresh failed; retrying")
			timer := time.NewTimer(15 * time.Second)
			select {
			case <-root.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
		}
	}
}
