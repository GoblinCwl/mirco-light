package alerts

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type observedBody struct{ reads int }

func (b *observedBody) Read([]byte) (int, error) { b.reads++; return 0, io.EOF }
func (*observedBody) Close() error               { return nil }

func TestHTTPAlertsPreserveBodyAndExcludeSecretsAndExpectedErrors(t *testing.T) {
	previous := current.Load()
	defer current.Store(previous)
	r := &Recorder{queue: make(chan Event, 8), log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	SetDefault(r)
	body := &observedBody{}
	base := roundTrip(func(req *http.Request) (*http.Response, error) {
		if req.Header.Get("Authorization") != "secret" {
			t.Fatal("request headers changed")
		}
		return &http.Response{StatusCode: 503, Header: make(http.Header), Body: body}, nil
	})
	client := &http.Client{Transport: base}
	req, _ := http.NewRequest("GET", "https://user:secret@service.test/private/session-token?api_key=secret", nil)
	req.Header.Set("Authorization", "secret")
	res, err := Do(client, "Test API", req)
	if err != nil || res.Body != body || body.reads != 0 {
		t.Fatal("observer changed streaming behavior", err)
	}
	event := <-r.queue
	if event.Code != 503 || event.Target != "https://service.test" || strings.Contains(event.Message, "secret") {
		t.Fatal("unsafe event", event)
	}
	for _, status := range []int{200, 404, 400} {
		client.Transport = roundTrip(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
		})
		if _, err = Do(client, "Test API", req); err != nil {
			t.Fatal(err)
		}
	}
	if len(r.queue) != 0 {
		t.Fatal("normal response produced alerts")
	}
	client.Transport = roundTrip(func(*http.Request) (*http.Response, error) { return nil, errors.New("raw error containing secret") })
	Do(client, "Test API", req)
	event = <-r.queue
	if strings.Contains(event.Message, "secret") {
		t.Fatal("raw upstream error leaked")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	Do(client, "Test API", req.WithContext(ctx))
	if len(r.queue) != 0 {
		t.Fatal("user cancellation produced alert")
	}
}

func TestTargetsDropUserInfoPathsAndQueries(t *testing.T) {
	if SafeTarget("https://name:secret@host.test:8080/path/token?key=secret#fragment") != "https://host.test:8080" {
		t.Fatal("unsafe target")
	}
	for _, target := range []string{"file:///private/secret", "javascript:alert(1)", "not a URL"} {
		if SafeTarget(target) != "" {
			t.Fatal("accepted invalid target")
		}
	}
}
