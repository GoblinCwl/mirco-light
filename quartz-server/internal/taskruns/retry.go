package taskruns

import (
	"context"
	"errors"
)

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
func (t *Tracker) Retry(ctx context.Context, key string) error {
	t.mu.Lock()
	request := t.retries[key]
	if request == nil {
		t.mu.Unlock()
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
	item, err := t.instance(ctx, d)
	if err != nil {
		return err
	}
	if item.Last == nil || (item.Last.Status != "failed" && item.Last.Status != "interrupted") || item.Running > 0 {
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
