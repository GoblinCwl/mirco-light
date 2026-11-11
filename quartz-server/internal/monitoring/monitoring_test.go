package monitoring

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestProjectionPrivacyAndZeroDiskIO(t *testing.T) {
	raw := map[string]any{"cpu": float64(1), "dp": float64(26), "private": "secret", "t": map[string]any{"k10temp-private": float64(52), "amdgpu-private": float64(80), "nvme-private": float64(39)}, "g": map[string]any{"hardware secret": map[string]any{"u": float64(60), "t": float64(82)}}}
	result := Stats(raw)
	data, _ := json.Marshal(result)
	if strings.Contains(string(data), "private") || strings.Contains(string(data), "secret") {
		t.Fatal("inventory leaked")
	}
	if result["temperature"] != float64(52) || result["gpu"] != float64(60) || object(result["temperatures"])["gpu"] != float64(82) {
		t.Fatal(result)
	}
	if len(result["dio"].([]any)) != 2 {
		t.Fatal("idle IO missing")
	}
	raw["dio"] = nil
	if _, ok := Stats(raw)["dio"]; ok {
		t.Fatal("explicit unknown IO replaced with zero")
	}
}
func TestServiceStates(t *testing.T) {
	now := time.Now()
	for _, v := range []struct {
		host, status string
		health       int
		age          time.Duration
		want         string
	}{{"down", "Up", 0, 0, "offline"}, {"up", "Up 3 days", 0, time.Second, "running"}, {"up", "Up", 3, 0, "error"}, {"up", "Restarting", 0, 0, "error"}, {"up", "Exited", 0, 0, "offline"}, {"up", "Up", 0, 4 * time.Minute, "unknown"}} {
		if got := ContainerState(v.host, v.status, v.health, now.Add(-v.age).UnixMilli(), now); got != v.want {
			t.Fatal(v, got)
		}
	}
}
func TestRealtimeSubscriptionWindowAndCancellation(t *testing.T) {
	subscribe := make(chan struct{}, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/realtime" {
			http.NotFound(w, r)
			return
		}
		if r.Method == "POST" {
			if r.Header.Get("Authorization") != "fixture-token" {
				t.Error("token missing")
			}
			var value struct {
				ClientID      string   `json:"clientId"`
				Subscriptions []string `json:"subscriptions"`
			}
			if json.NewDecoder(r.Body).Decode(&value) != nil || value.ClientID != "client" || len(value.Subscriptions) != 1 || !strings.HasPrefix(value.Subscriptions[0], "rt_metrics?options=") {
				t.Error("bad subscription")
			}
			w.WriteHeader(204)
			subscribe <- struct{}{}
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "event: PB_CONNECT\nid: client\ndata: {}\n\n")
		w.(http.Flusher).Flush()
		select {
		case <-subscribe:
		case <-r.Context().Done():
			return
		}
		fmt.Fprint(w, "event: rt_metrics\ndata: {\"stats\":{\"cpu\":12.5,\"dp\":26,\"secret\":\"private\"}}\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer upstream.Close()
	path := filepath.Join(t.TempDir(), "beszel.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec("CREATE TABLE systems(id TEXT,name TEXT,status TEXT,info TEXT,updated TEXT); INSERT INTO systems VALUES('host','Cwl-Server','up','{\"u\":123,\"private\":true}','2026-11-10 00:00:00.000Z')")
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	manager, err := Open(context.Background(), path, func(context.Context) (map[string]any, error) {
		return map[string]any{"api.beszel.url": upstream.URL, "api.beszel.token": "fixture-token"}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	closed := false
	defer func() {
		if !closed {
			manager.Close()
		}
	}()
	deadline := time.Now().Add(3 * time.Second)
	ready := false
	for time.Now().Before(deadline) {
		value, err := manager.Monitoring(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		system := value["systems"].([]map[string]any)[0]
		if len(system["history"].([]Point)) > 0 {
			if object(system["current"])["cpu"] != 12.5 {
				t.Fatal(system)
			}
			raw, _ := json.Marshal(value)
			if strings.Contains(string(raw), "private") {
				t.Fatal("private metrics leaked")
			}
			ready = true
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !ready {
		t.Fatal("no realtime sample")
	}
	done := make(chan error, 1)
	go func() { done <- manager.Close() }()
	select {
	case err := <-done:
		closed = true
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("SSE shutdown stuck")
	}
}

func TestServiceProbeUsesConfiguredHealthURLAndRetainsFallback(t *testing.T) {
	var requested string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requested = r.URL.RequestURI(); w.WriteHeader(200) }))
	defer upstream.Close()
	manager := &Manager{}
	config := ServiceConfig{ID: "fixture", Name: "Test", URL: upstream.URL + "/custom/ready?check=1", Strict: true}
	values := map[string]any{"api.jellyfin.url": upstream.URL}
	service := manager.probe(context.Background(), config, values)
	if requested != "/custom/ready?check=1" || service.State != "running" || service.Source != "direct" {
		t.Fatal(requested, service)
	}
	config.Integration = "jellyfin"
	service = manager.probe(context.Background(), config, values)
	if requested != "/health" || service.State != "running" {
		t.Fatal(requested, service)
	}
}
func TestBeszelUnavailableFallsBackToConfiguredHTTPServices(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/health" || r.URL.Path == "/beszel" {
			w.WriteHeader(503)
			return
		}
		w.WriteHeader(200)
	}))
	defer upstream.Close()
	registry := registryFixture(t)
	for _, d := range definitions {
		if _, err := registry.DB.Exec("INSERT INTO monitored_services(id,name,integration,container_name,http_url,strict_status,credential_id,enabled,sort_order) VALUES(?,?,?,?,?,?,NULL,1,0)", d.id, d.name, d.id, d.container, upstream.URL+"/"+d.id, d.health); err != nil {
			t.Fatal(err)
		}
	}
	values := map[string]any{"openlist.url": upstream.URL, "api.fontinass.health": upstream.URL}
	for _, d := range definitions {
		values["api."+d.id+".url"] = upstream.URL
	}
	manager := &Manager{Registry: registry, Settings: func(context.Context) (map[string]any, error) { return values, nil }}
	services, err := manager.Services(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(services) != len(definitions) {
		t.Fatal(services)
	}
	for _, service := range services {
		if service.Source != "direct" {
			t.Fatal(service)
		}
		if service.ID == "beszel" {
			if service.State != "error" {
				t.Fatal(service)
			}
		} else if service.State != "running" && service.State != "reachable" {
			t.Fatal(service)
		}
	}
}
