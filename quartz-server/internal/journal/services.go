package journal

import (
	"context"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/observer"
	"goblincwl/quartz-server/internal/taskruns"
	"os"
	"time"
)

func (s Store) ServiceFile(ctx context.Context, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if len(raw) > 1<<20 {
		return errors.New("observer snapshot too large")
	}
	var snapshot observer.Snapshot
	if err = json.Unmarshal(raw, &snapshot); err != nil {
		return err
	}
	if snapshot.Events == nil || len(snapshot.Events) > 10 {
		return errors.New("invalid observer events")
	}
	if len(snapshot.TaskRuns) > 10 {
		return errors.New("invalid observer task history")
	}
	for _, run := range snapshot.TaskRuns {
		if run.Key != "container-observer" || run.RunKey == nil || len(*run.RunKey) > 96 || run.Status != "success" && run.Status != "failed" {
			return errors.New("invalid observer task run")
		}
		if _, err = time.Parse(time.RFC3339Nano, run.StartedAt); err != nil {
			return err
		}
		if _, err = time.Parse(time.RFC3339Nano, run.FinishedAt); err != nil {
			return err
		}
	}
	if tracker := taskruns.From(ctx); tracker != nil {
		if err = tracker.ImportBatch(ctx, "container-observer", snapshot.TaskRuns); err != nil {
			return err
		}
	}
	names := map[string]bool{}
	for _, definition := range observer.Services {
		names[definition.Name] = true
	}
	for _, event := range snapshot.Events {
		if event.ID == "" || len(event.ID) > 191 || !names[event.Service] || event.Operation != "restart" && event.Operation != "recreate" {
			return errors.New("invalid service event")
		}
		if _, err = time.Parse(time.RFC3339Nano, event.CompletedAt); err != nil {
			return err
		}
	}
	if len(snapshot.Failures) > 128 {
		return errors.New("invalid observer failures")
	}
	for _, failure := range snapshot.Failures {
		if failure.ID == "" || len(failure.ID) > 191 || !names[failure.Service] || (failure.Status != "offline" && failure.Status != "unhealthy" && failure.Status != "restarting") {
			return errors.New("invalid observer failure")
		}
		if _, err = time.Parse(time.RFC3339Nano, failure.ObservedAt); err != nil {
			return err
		}
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "INSERT INTO runtime_state(name,value,updated_at) VALUES('observer-checkpoint','[]',?) ON DUPLICATE KEY UPDATE name=VALUES(name)", time.Now().UTC().Format("2006-01-02T15:04:05.000Z")); err != nil {
		return err
	}
	var stored string
	if err = tx.QueryRowContext(ctx, "SELECT value FROM runtime_state WHERE name='observer-checkpoint' FOR UPDATE").Scan(&stored); err != nil {
		return err
	}
	var previous []string
	if err = json.Unmarshal([]byte(stored), &previous); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, key := range previous {
		seen[key] = true
	}
	next := []string{}
	for _, event := range snapshot.Events {
		next = append(next, event.ID)
		if seen[event.ID] {
			continue
		}
		if err = Append(ctx, tx, "service", map[string]any{"service": event.Service, "operation": event.Operation}, event.CompletedAt, event.ID); err != nil {
			return err
		}
	}
	for _, failure := range snapshot.Failures {
		next = append(next, failure.ID)
		if seen[failure.ID] {
			continue
		}
		message := map[string]string{"offline": "容器连续两次检测未运行", "unhealthy": "容器连续两次健康检查异常", "restarting": "容器连续两次处于重启状态"}[failure.Status]
		at, _ := time.Parse(time.RFC3339Nano, failure.ObservedAt)
		if err = alerts.RecordTx(ctx, tx, alerts.Event{Kind: "service", Source: failure.Service, Title: "服务状态异常", Message: message}, at); err != nil {
			return err
		}
	}
	encoded, _ := json.Marshal(next)
	if string(encoded) != stored {
		if _, err = tx.ExecContext(ctx, "UPDATE runtime_state SET value=?,updated_at=? WHERE name='observer-checkpoint'", string(encoded), time.Now().UTC().Format("2006-01-02T15:04:05.000Z")); err != nil {
			return err
		}
	}
	return tx.Commit()
}
