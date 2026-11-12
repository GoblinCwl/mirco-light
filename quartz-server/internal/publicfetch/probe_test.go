package publicfetch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHomepageProbeAcceptsSuccessfulGETAndRejectsFailures(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Error("homepage test must use GET")
		}
		switch r.URL.Path {
		case "/empty":
			w.WriteHeader(204)
		case "/bad":
			w.WriteHeader(503)
		default:
			w.WriteHeader(200)
		}
	}))
	defer server.Close()
	for _, path := range []string{"/", "/empty"} {
		if err := Probe(context.Background(), server.URL+path, server.Client()); err != nil {
			t.Fatal(path, err)
		}
	}
	if err := Probe(context.Background(), server.URL+"/bad", server.Client()); err == nil {
		t.Fatal("accepted failed homepage")
	}
	if err := Probe(context.Background(), server.URL, nil); err == nil {
		t.Fatal("public probe accepted a private address")
	}
}
