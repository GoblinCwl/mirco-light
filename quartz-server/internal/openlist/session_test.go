package openlist

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
)

func TestSessionSingleFlightAndConfigInvalidation(t *testing.T) {
	var calls atomic.Int64
	var role atomic.Int64
	role.Store(2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path == "/api/auth/login" {
			json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": map[string]string{"token": "test-token"}})
			return
		}
		if r.Header.Get("Authorization") != "test-token" {
			t.Error("token not passed to user verification")
		}
		json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": map[string]any{"role": role.Load()}})
	}))
	defer server.Close()
	password := "one"
	session := Session{ReadSettings: func(context.Context) (map[string]any, error) {
		return map[string]any{"openlist.url": server.URL, "openlist.username": "admin", "openlist.password": password}, nil
	}}
	var wait sync.WaitGroup
	for range 10 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			value, err := session.Get(context.Background())
			if err != nil || value["configured"] != true {
				t.Error("session failed", err)
			}
		}()
	}
	wait.Wait()
	if calls.Load() != 2 {
		t.Fatal("duplicate authentication calls", calls.Load())
	}
	password = "two"
	role.Store(1)
	if _, err := session.Get(context.Background()); err == nil {
		t.Fatal("non-admin token exposed")
	}
}
