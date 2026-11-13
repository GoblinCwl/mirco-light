package taskruns

import (
	"context"
	"database/sql"
	"fmt"
	"goblincwl/quartz-server/internal/taskconfig"
	"time"
)

type QueueView struct {
	Items   []QueueItem `json:"items"`
	Total   int         `json:"total"`
	Waiting int         `json:"waiting"`
	Running int         `json:"running"`
	Page    int         `json:"page"`
	Pages   int         `json:"pages"`
}
type Instance struct {
	Definition
	Schedule  string     `json:"schedule"`
	Last      *RunRecord `json:"lastRun"`
	Remaining int        `json:"remaining"`
	Waiting   int        `json:"waiting"`
	Running   int        `json:"running"`
}

func (t *Tracker) queue(ctx context.Context, key string, page int) (QueueView, error) {
	out := QueueView{Items: []QueueItem{}, Page: max(page, 1), Pages: 1}
	if key == "friend-jobs" {
		if err := t.DB.QueryRowContext(ctx, "SELECT count(*),coalesce(sum(state='pending'),0),coalesce(sum(state='running'),0) FROM friend_jobs").Scan(&out.Total, &out.Waiting, &out.Running); err != nil {
			return out, err
		}
		out.Pages = max(1, (out.Total+19)/20)
		out.Page = min(out.Page, out.Pages)
		rows, err := t.DB.QueryContext(ctx, "SELECT j.friend_id,f.name,j.state,j.attempts,j.available_at,j.last_error FROM friend_jobs j JOIN friends f ON f.id=j.friend_id ORDER BY j.available_at,j.enqueued_at,j.friend_id LIMIT 20 OFFSET ?", (out.Page-1)*20)
		if err != nil {
			return out, err
		}
		defer rows.Close()
		for rows.Next() {
			var item QueueItem
			var due int64
			if err = rows.Scan(&item.ID, &item.Label, &item.State, &item.Attempts, &due, &item.Error); err != nil {
				return out, err
			}
			if due > 0 {
				item.AvailableAt = stamp(time.UnixMilli(due))
			}
			item.Error = Clean(item.Error, 1000)
			out.Items = append(out.Items, item)
		}
		return out, rows.Err()
	}
	t.mu.RLock()
	provider := t.providers[key]
	t.mu.RUnlock()
	if provider == nil {
		return out, nil
	}
	items := provider()
	out.Total = len(items)
	for _, item := range items {
		if item.State == "running" {
			out.Running++
		} else {
			out.Waiting++
		}
	}
	out.Pages = max(1, (out.Total+19)/20)
	out.Page = min(out.Page, out.Pages)
	start := (out.Page - 1) * 20
	end := min(start+20, len(items))
	out.Items = append(out.Items, items[start:end]...)
	for i := range out.Items {
		out.Items[i].Error = Clean(out.Items[i].Error, 1000)
	}
	return out, nil
}
func (t *Tracker) history(ctx context.Context, key string) ([]RunRecord, error) {
	rows, err := t.DB.QueryContext(ctx, "SELECT id,task_key,run_key,started_at,finished_at,status,duration_ms,error,logs FROM task_runs WHERE task_key=? ORDER BY id DESC LIMIT 10", key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []RunRecord{}
	for rows.Next() {
		var r RunRecord
		if err = rows.Scan(&r.ID, &r.Key, &r.RunKey, &r.StartedAt, &r.FinishedAt, &r.Status, &r.Duration, &r.Error, &r.Logs); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (t *Tracker) instance(ctx context.Context, d Definition) (Instance, error) {
	item := Instance{Definition: d, Schedule: "事件触发"}
	cfg := t.Config
	if d.Period != "" {
		seconds := int(taskconfig.Duration(taskconfig.With(ctx, cfg), d.Period).Seconds())
		if d.Kind == "periodic" {
			item.Schedule = intervalLabel(seconds)
		} else {
			item.Schedule = fmt.Sprintf("异常后 %d 秒重试", seconds)
		}
	}
	if d.Key == "friends-refresh" {
		item.Schedule = fmt.Sprintf("每 %d 天 %s · 北京时间", cfg.FriendDays(), cfg.Clock())
	}
	runs, err := t.history(ctx, d.Key)
	if err != nil {
		return item, err
	}
	if len(runs) > 0 {
		item.Last = &runs[0]
	}
	if d.Queue {
		q, err := t.queue(ctx, d.Key, 1)
		if err != nil {
			return item, err
		}
		item.Remaining = q.Total
		item.Waiting = q.Waiting
		item.Running = q.Running
	}
	return item, nil
}
func (t *Tracker) List(ctx context.Context) (map[string]any, error) {
	items := []Instance{}
	for _, d := range Definitions {
		item, err := t.instance(ctx, d)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return map[string]any{"tasks": items, "updatedAt": stamp(time.Now())}, nil
}
func (t *Tracker) Detail(ctx context.Context, key string, page int) (map[string]any, error) {
	d, ok := Lookup(key)
	if !ok {
		return nil, sql.ErrNoRows
	}
	item, err := t.instance(ctx, d)
	if err != nil {
		return nil, err
	}
	runs, err := t.history(ctx, key)
	if err != nil {
		return nil, err
	}
	queue, err := t.queue(ctx, key, page)
	if err != nil {
		return nil, err
	}
	return map[string]any{"task": item, "runs": runs, "queue": queue}, nil
}

func intervalLabel(seconds int) string {
	for _, unit := range []struct {
		seconds int
		label   string
	}{{86400, "天"}, {3600, "小时"}, {60, "分钟"}} {
		if seconds >= unit.seconds && seconds%unit.seconds == 0 {
			return fmt.Sprintf("每 %d %s", seconds/unit.seconds, unit.label)
		}
	}
	return fmt.Sprintf("每 %d 秒", seconds)
}
