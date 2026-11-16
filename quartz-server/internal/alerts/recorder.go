package alerts

import (
	"context"
	"database/sql"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

var current atomic.Pointer[Recorder]

type Recorder struct {
	store  Store
	log    *slog.Logger
	queue  chan Event
	done   chan struct{}
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.RWMutex
	closed bool
}

func NewRecorder(db *sql.DB, log *slog.Logger) *Recorder {
	if log == nil {
		log = slog.Default()
	}
	ctx, cancel := context.WithCancel(context.Background())
	r := &Recorder{store: Store{DB: db}, log: log, queue: make(chan Event, 128), done: make(chan struct{}), ctx: ctx, cancel: cancel}
	go func() {
		defer close(r.done)
		for event := range r.queue {
			ctx, cancel := context.WithTimeout(r.ctx, 2*time.Second)
			err := r.store.Record(ctx, event)
			cancel()
			if err != nil {
				r.log.Error("告警未能写入数据库", "source", event.Source, "title", event.Title, "target", event.Target)
			}
		}
	}()
	return r
}
func SetDefault(r *Recorder) { current.Store(r) }
func Emit(event Event) {
	if r := current.Load(); r != nil {
		r.Emit(event)
	}
}
func (r *Recorder) Emit(event Event) {
	event, err := normalize(event)
	if err != nil {
		return
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	if r.closed {
		return
	}
	select {
	case r.queue <- event:
	default:
		r.log.Warn("告警队列已满，记录保留在进程日志", "source", event.Source, "title", event.Title)
	}
}
func (r *Recorder) Close() {
	r.mu.Lock()
	if r.closed {
		r.mu.Unlock()
		return
	}
	r.closed = true
	close(r.queue)
	r.mu.Unlock()
	current.CompareAndSwap(r, nil)
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	select {
	case <-r.done:
	case <-timer.C:
		r.cancel()
		<-r.done
	}
	r.cancel()
}
