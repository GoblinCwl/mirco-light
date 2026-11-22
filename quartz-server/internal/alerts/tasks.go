package alerts

import (
	"context"
	"goblincwl/quartz-server/internal/taskruns"
)

// TrackFailures connects the task recorder to alerts without a package cycle.
// Delivery workers do not execute tracked tasks, so notification errors cannot recurse.
func TrackFailures(tracker *taskruns.Tracker) {
	tracker.OnFailure = func(ctx context.Context, key, message string) error {
		name, title := key, "任务执行失败"
		if d, ok := taskruns.Lookup(key); ok {
			name = d.Name
			if d.Queue {
				title = "队列处理失败"
			}
		}
		if message == "" {
			message = "执行失败，请查看任务日志"
		}
		return (Store{DB: tracker.DB}).Record(ctx, Event{TaskKey: key, Kind: "task", Level: "error", Source: name, Title: title, Message: taskruns.Clean(message, 1000)})
	}
}
