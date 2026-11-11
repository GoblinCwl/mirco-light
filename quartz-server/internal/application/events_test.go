package application

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync/atomic"
	"testing"
	"time"
)

func TestEventTaskCoalescesAndDoesNotPollAfterSuccess(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var calls atomic.Int32
	done := make(chan struct{}, 4)
	task := newEventTask("fixture", time.Second, func(context.Context) error { calls.Add(1); done <- struct{}{}; return nil })
	for range 100 {
		task.request()
	}
	stopped := make(chan struct{})
	go func() { defer close(stopped); task.run(ctx, slog.New(slog.NewTextHandler(io.Discard, nil))) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("event not handled")
	}
	time.Sleep(30 * time.Millisecond)
	if calls.Load() != 1 {
		t.Fatal("idle task polled", calls.Load())
	}
	cancel()
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("idle task did not stop")
	}
}

func TestNewEventWakesFailureRetryAndPreservesEventsDuringWork(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var calls atomic.Int32
	entered := make(chan int32, 4)
	release := make(chan struct{})
	task := newEventTask("fixture", time.Second, func(context.Context) error {
		n := calls.Add(1)
		entered <- n
		if n == 1 {
			return errors.New("upstream unavailable")
		}
		if n == 2 {
			<-release
		}
		return nil
	})
	go task.run(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)))
	wait := func(want int32) {
		t.Helper()
		select {
		case n := <-entered:
			if n != want {
				t.Fatal(n, want)
			}
		case <-time.After(time.Second):
			t.Fatal("event not handled", want)
		}
	}
	task.request()
	wait(1)
	task.request()
	wait(2)
	task.request()
	close(release)
	wait(3)
}
