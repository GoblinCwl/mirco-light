package taskruns

import (
	"context"
	"errors"
	"time"
)

var ErrTriggerUnavailable = errors.New("任务当前无法主动执行")

var ErrRetryUnavailable = errors.New("任务当前不可重试")
var ErrRetryPending = errors.New("任务已在执行或等待重试")

func (t *Tracker) RegisterRetry(key string, request func(context.Context) error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.retries == nil {
		t.retries = map[string]func(context.Context) error{}
	}
	t.retries[key] = request
}
func (t *Tracker) canRetry(key string) bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.retries[key] != nil && !t.retryPending[key] && t.running[key] == 0
}
func (t *Tracker) RegisterTrigger(key string, request func(context.Context) error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.triggers == nil {
		t.triggers = map[string]func(context.Context) error{}
	}
	t.triggers[key] = request
}
func (t *Tracker) canTrigger(key string) bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	d, ok := Lookup(key)
	if !ok || (d.Kind == "event" && t.triggers[key] == nil) {
		return false
	}
	return (t.triggers[key] != nil || t.retries[key] != nil) && !t.retryPending[key] && t.running[key] == 0
}
func (t *Tracker) Trigger(ctx context.Context, key string) error { return t.dispatch(ctx, key, false) }
func (t *Tracker) Retry(ctx context.Context, key string) error   { return t.dispatch(ctx, key, true) }
func (t *Tracker) dispatch(ctx context.Context, key string, requireFailure bool) error {
	t.mu.Lock()
	if !requireFailure {
		d, ok := Lookup(key)
		if !ok || (d.Kind == "event" && t.triggers[key] == nil) {
			t.mu.Unlock()
			return ErrTriggerUnavailable
		}
	}
	request := t.retries[key]
	if !requireFailure && t.triggers[key] != nil {
		request = t.triggers[key]
	}
	if request == nil {
		t.mu.Unlock()
		if !requireFailure {
			return ErrTriggerUnavailable
		}
		return ErrRetryUnavailable
	}
	if t.retryPending == nil {
		t.retryPending = map[string]bool{}
	}
	if t.retryPending[key] || t.running[key] > 0 {
		t.mu.Unlock()
		return ErrRetryPending
	}
	t.retryPending[key] = true
	t.mu.Unlock()
	success := false
	defer func() {
		if !success {
			t.mu.Lock()
			delete(t.retryPending, key)
			t.mu.Unlock()
		}
	}()
	d, ok := Lookup(key)
	if !ok {
		return ErrRetryUnavailable
	}
	item, err := t.instance(ctx, d, time.Now())
	if err != nil {
		return err
	}
	if item.Running > 0 || (!requireFailure && item.Last != nil && item.Last.Status == "running") {
		return ErrRetryPending
	}
	if requireFailure && (item.Last == nil || (item.Last.Status != "failed" && item.Last.Status != "interrupted")) {
		return ErrRetryUnavailable
	}
	if err = request(ctx); err != nil {
		return err
	}
	success = true
	return nil
}

// RetrySignal coalesces requests and lets the existing worker execute serially.
func (t *Tracker) RetrySignal(key string) <-chan struct{} {
	wake := make(chan struct{}, 1)
	t.RegisterRetry(key, func(context.Context) error {
		select {
		case wake <- struct{}{}:
		default:
		}
		return nil
	})
	return wake
}
