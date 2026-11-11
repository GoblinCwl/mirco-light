package buildcontrol

import (
	"context"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
)

func TestPrivatePublicationSocket(t *testing.T) {
	path := filepath.Join(t.TempDir(), "published.sock")
	var calls atomic.Int32
	server, listener, err := ListenPublished(path, func() { calls.Add(1) })
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	go server.Serve(listener)
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", path)
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport}
	for _, item := range []struct {
		method, path string
		code         int
	}{{"GET", "/published", 405}, {"POST", "/arbitrary", 404}, {"POST", "/published", 202}} {
		req, _ := http.NewRequest(item.method, "http://private"+item.path, nil)
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != item.code {
			t.Fatal(res.StatusCode, item)
		}
	}
	if calls.Load() != 1 {
		t.Fatal("invalid request triggered publication")
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0660 {
		t.Fatal("socket permissions", info.Mode())
	}
}

func TestPublicationSocketDoesNotRemoveOtherFiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "published.sock")
	os.WriteFile(path, []byte("keep"), 0600)
	if _, _, err := ListenPublished(path, func() {}); err == nil {
		t.Fatal("accepted ordinary file")
	}
	raw, _ := os.ReadFile(path)
	if string(raw) != "keep" {
		t.Fatal("removed ordinary file")
	}
}
