package taskruns

import (
	"sync"
	"time"
)

// QueueState exposes coalesced in-memory events without claiming they are durable rows.
type QueueState struct {
	Name   string
	mu     sync.Mutex
	active *QueueItem
}

func NewQueueState(name string) *QueueState {
	if definition, ok := Lookup(name); ok {
		name = definition.Name
	}
	return &QueueState{Name: name}
}
func (q *QueueState) Start() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.active == nil {
		q.active = &QueueItem{ID: "current", Label: q.Name}
	}
	q.active.State = "running"
	q.active.AvailableAt = ""
}
func (q *QueueState) Retry(err error, delay time.Duration) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.active == nil {
		q.active = &QueueItem{ID: "current", Label: q.Name}
	}
	q.active.State = "retry"
	q.active.Attempts++
	q.active.Error = Clean(err.Error(), 1000)
	q.active.AvailableAt = stamp(time.Now().Add(delay))
}
func (q *QueueState) Done() { q.mu.Lock(); q.active = nil; q.mu.Unlock() }
func (q *QueueState) Snapshot(pending int) []QueueItem {
	q.mu.Lock()
	defer q.mu.Unlock()
	out := []QueueItem{}
	if q.active != nil {
		out = append(out, *q.active)
	}
	if pending > 0 {
		out = append(out, QueueItem{ID: "pending", Label: q.Name + "（合并后的新事件）", State: "pending"})
	}
	return out
}
