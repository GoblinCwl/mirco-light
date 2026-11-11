package application

import (
	"context"
	"goblincwl/quartz-server/internal/alerts"
	"log/slog"
	"time"
)

// One pending event coalesces bursts. Timers exist only after a failed attempt;
// idle tasks do no polling. A new event wakes a failed task immediately.
type eventTask struct {
	name    string
	timeout time.Duration
	pending chan struct{}
	work    func(context.Context) error
}

func newEventTask(name string, timeout time.Duration, work func(context.Context) error) *eventTask {
	return &eventTask{name: name, timeout: timeout, pending: make(chan struct{}, 1), work: work}
}
func (t *eventTask) request() {
	select {
	case t.pending <- struct{}{}:
	default:
	}
}
func (t *eventTask) run(root context.Context, log *slog.Logger) {
	for {
		select {
		case <-root.Done():
			return
		case <-t.pending:
		}
		for {
			ctx, cancel := context.WithTimeout(root, t.timeout)
			err := t.work(ctx)
			cancel()
			if err == nil {
				break
			}
			if root.Err() != nil {
				return
			}
			alerts.Emit(alerts.Event{Kind: "task", Source: alerts.TaskName(t.name), Title: "事件处理失败", Message: "保留已有数据，将按原有机制重试"})
			log.Warn("event task failed; retrying", "task", t.name)
			timer := time.NewTimer(15 * time.Second)
			select {
			case <-root.Done():
				timer.Stop()
				return
			case <-t.pending:
				timer.Stop()
			case <-timer.C:
			}
		}
	}
}
