package repo

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLanguageBytesAreFetchedFromGiteaAndCached(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/api/v1/repos/owner/project/languages" {
			t.Error(r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"Go":750,"Shell":250,"empty":0}`))
	}))
	defer server.Close()
	adapter := &Adapter{Owner: "owner", Origin: func(context.Context) (string, error) { return server.URL, nil }}
	for range 2 {
		result, err := adapter.Languages(context.Background(), "project")
		if err != nil {
			t.Fatal(err)
		}
		counts := result["languages"].(map[string]int64)
		if counts["Go"] != 750 || counts["Shell"] != 250 || len(counts) != 2 {
			t.Fatal(counts)
		}
	}
	if calls != 1 {
		t.Fatal("cache not used", calls)
	}
}
