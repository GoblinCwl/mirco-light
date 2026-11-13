package application

import (
	"context"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
	"log/slog"
	"time"
)

// One pending event coalesces bursts. Timers exist only after a failed attempt;
// idle tasks do no polling. A new event wakes a failed task immediately.
type eventTask struct {
	name     string
	retryKey string
	timeout  time.Duration
	pending  chan struct{}
	work     func(context.Context) error
}

func newEventTask(name string, timeout time.Duration, work func(context.Context) error) *eventTask {
	return &eventTask{name: name, retryKey: "event-retry", timeout: timeout, pending: make(chan struct{}, 1), work: work}
}
func (t *eventTask) request() {
	select {
	case t.pending <- struct{}{}:
	default:
	}
}
func (t *eventTask) run(root context.Context, log *slog.Logger) {
	state := taskruns.NewQueueState(t.name)
	if tracker := taskruns.From(root); tracker != nil {
		tracker.RegisterQueue(t.name, func() []taskruns.QueueItem { return state.Snapshot(len(t.pending)) })
	}
	for {
		select {
		case <-root.Done():
			return
		case <-t.pending:
		}
		for {
			ctx, cancel := context.WithTimeout(root, t.timeout)
			state.Start()
			err := taskruns.Run(ctx, t.name, t.work)
			cancel()
			if err == nil {
				state.Done()
				break
			}
			if root.Err() != nil {
				return
			}
			alerts.Emit(alerts.Event{Kind: "task", Source: alerts.TaskName(t.name), Title: "事件处理失败", Message: "保留已有数据，将按原有机制重试"})
			log.Warn("event task failed; retrying", "task", t.name)
			state.Retry(err, taskconfig.Duration(root, t.retryKey))
			if !taskconfig.Wait(root, t.retryKey, t.pending) {
				return
			}
		}
	}
}
