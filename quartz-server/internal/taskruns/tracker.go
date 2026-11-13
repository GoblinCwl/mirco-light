package taskruns

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/taskconfig"
	"log/slog"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

type RunRecord struct {
	ID         int64   `json:"id"`
	Key        string  `json:"key"`
	RunKey     *string `json:"runKey,omitempty"`
	StartedAt  string  `json:"startedAt"`
	FinishedAt string  `json:"finishedAt"`
	Status     string  `json:"status"`
	Duration   int64   `json:"durationMs"`
	Error      string  `json:"error"`
	Logs       string  `json:"logs"`
}
type QueueItem struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	State       string `json:"state"`
	Attempts    int    `json:"attempts"`
	AvailableAt string `json:"availableAt"`
	Error       string `json:"error"`
}
type Tracker struct {
	DB           *sql.DB
	Config       *taskconfig.Config
	mu           sync.RWMutex
	writeMu      sync.Mutex
	providers    map[string]func() []QueueItem
	retries      map[string]func(context.Context) error
	retryPending map[string]bool
	running      map[string]int
	external     map[string]string
}
type trackerKey struct{}
type spanKey struct{}
type span struct {
	mu    sync.Mutex
	lines []string
}

func New(db *sql.DB) *Tracker {
	return &Tracker{DB: db, providers: map[string]func() []QueueItem{}, external: map[string]string{}}
}
func With(ctx context.Context, t *Tracker) context.Context {
	return context.WithValue(ctx, trackerKey{}, t)
}
func From(ctx context.Context) *Tracker { t, _ := ctx.Value(trackerKey{}).(*Tracker); return t }
func Active(ctx context.Context) bool   { _, ok := ctx.Value(spanKey{}).(*span); return ok }
func (t *Tracker) RegisterQueue(key string, provider func() []QueueItem) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.providers[key] = provider
}

var addresses = regexp.MustCompile(`https?://[^\s<>"']+`)
var authorization = regexp.MustCompile(`(?i)(authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)\s+[^\s,;]+`)
var secret = regexp.MustCompile(`(?i)(password|authorization|access_token|refresh_token|api_key|token|secret)\s*[:=]\s*[^\s,;]+`)

func Clean(value string, limit int) string {
	value = addresses.ReplaceAllStringFunc(value, func(raw string) string {
		u, err := url.Parse(raw)
		if err != nil {
			return "[地址]"
		}
		u.User = nil
		u.RawQuery = ""
		u.Fragment = ""
		return u.String()
	})
	value = authorization.ReplaceAllString(value, "$1=[已隐藏]")
	value = secret.ReplaceAllString(value, "$1=[已隐藏]")
	value = strings.Map(func(r rune) rune {
		if r < 32 && r != '\n' && r != '\t' {
			return ' '
		}
		return r
	}, value)
	runes := []rune(value)
	if len(runes) > limit {
		return string(runes[:limit]) + "…"
	}
	return value
}
func Note(ctx context.Context, message string) {
	if s, ok := ctx.Value(spanKey{}).(*span); ok {
		s.mu.Lock()
		defer s.mu.Unlock()
		if len(s.lines) < 24 {
			s.lines = append(s.lines, time.Now().In(time.FixedZone("CST", 8*3600)).Format("15:04:05")+" "+Clean(message, 500))
		}
	}
}
func stamp(at time.Time) string { return at.UTC().Format("2006-01-02T15:04:05.000Z") }
func (t *Tracker) Recover(ctx context.Context) error {
	_, err := t.DB.ExecContext(ctx, "UPDATE task_runs SET status='interrupted',finished_at=?,error='服务重启，前次执行未完成',logs=CONCAT(logs,'\\n服务重启，前次执行未完成') WHERE status='running'", stamp(time.Now()))
	return err
}
func (t *Tracker) start(ctx context.Context, key string) (int64, error) {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	tx, err := t.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, "INSERT INTO task_runs(task_key,started_at,status,error,logs) VALUES(?,?,'running','','开始执行')", key, stamp(time.Now()))
	if err != nil {
		return 0, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err = prune(ctx, tx, key); err != nil {
		return 0, err
	}
	return id, tx.Commit()
}
func prune(ctx context.Context, tx *sql.Tx, key string) error {
	_, err := tx.ExecContext(ctx, "DELETE FROM task_runs WHERE task_key=? AND id < (SELECT cutoff FROM (SELECT id AS cutoff FROM task_runs WHERE task_key=? ORDER BY id DESC LIMIT 1 OFFSET 9) recent)", key, key)
	return err
}
func Run(ctx context.Context, key string, work func(context.Context) error) (err error) {
	tracker := From(ctx)
	if tracker == nil {
		return work(ctx)
	}
	tracker.mu.Lock()
	delete(tracker.retryPending, key)
	if tracker.running == nil {
		tracker.running = map[string]int{}
	}
	tracker.running[key]++
	tracker.mu.Unlock()
	defer func() { tracker.mu.Lock(); tracker.running[key]--; tracker.mu.Unlock() }()
	started := time.Now()
	recordCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
	id, recordErr := tracker.start(recordCtx, key)
	cancel()
	if recordErr != nil {
		slog.Warn("task execution record could not be started", "task", key)
	}
	s := &span{}
	ctx = context.WithValue(ctx, spanKey{}, s)
	Note(ctx, "开始执行")
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("任务异常：%v", recovered)
		}
		status := "success"
		message := ""
		if err != nil {
			status = "failed"
			message = Clean(err.Error(), 4000)
		}
		if errors.Is(err, context.Canceled) {
			status = "interrupted"
		}
		if message != "" {
			Note(ctx, message)
		} else {
			Note(ctx, "执行完成")
		}
		s.mu.Lock()
		logs := Clean(strings.Join(s.lines, "\n"), 12000)
		s.mu.Unlock()
		if id > 0 {
			recordCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
			defer cancel()
			if _, e := tracker.DB.ExecContext(recordCtx, "UPDATE task_runs SET finished_at=?,status=?,duration_ms=?,error=?,logs=? WHERE id=?", stamp(time.Now()), status, time.Since(started).Milliseconds(), message, logs, id); e != nil {
				slog.Warn("task execution result could not be saved", "task", key)
			}
		}
	}()
	return work(ctx)
}
func (t *Tracker) Import(ctx context.Context, key string, r RunRecord) error {
	t.writeMu.Lock()
	defer t.writeMu.Unlock()
	if r.RunKey == nil {
		return errors.New("external run key missing")
	}
	tx, err := t.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, "INSERT IGNORE INTO task_runs(task_key,run_key,started_at,finished_at,status,duration_ms,error,logs) VALUES(?,?,?,?,?,?,?,?)", key, *r.RunKey, r.StartedAt, r.FinishedAt, r.Status, r.Duration, Clean(r.Error, 4000), Clean(r.Logs, 12000))
	if err != nil {
		return err
	}
	if err = prune(ctx, tx, key); err != nil {
		return err
	}
	return tx.Commit()
}

func (t *Tracker) ImportBatch(ctx context.Context, key string, runs []RunRecord) error {
	if len(runs) == 0 {
		return nil
	}
	last := runs[len(runs)-1].RunKey
	if last == nil {
		return errors.New("external run key missing")
	}
	t.mu.RLock()
	previous := t.external[key]
	t.mu.RUnlock()
	if previous == *last {
		return nil
	}
	for _, run := range runs {
		if err := t.Import(ctx, key, run); err != nil {
			return err
		}
	}
	t.mu.Lock()
	t.external[key] = *last
	delete(t.retryPending, key)
	t.mu.Unlock()
	return nil
}
