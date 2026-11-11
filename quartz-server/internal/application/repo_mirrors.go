package application

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"path/filepath"
	"time"
)

// The mirror producer keeps ownership of Gitea credentials and migrations.
// This private Unix socket has no public route or network listener.
func (r *Runtime) syncRepoMirrors(ctx context.Context) error {
	path := filepath.Join(filepath.Dir(r.options.RepoCatalog), "sync.sock")
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", path)
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 35 * time.Minute}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "http://mirror/sync", nil)
	if err != nil {
		return err
	}
	response, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("mirror control unavailable: %w", err)
	}
	defer response.Body.Close()
	// Even a partial pull may contain successful repositories; import those now.
	r.app.Repo.Cache.Invalidate()
	r.sources.Invalidate()
	if err = r.syncSource(ctx, "repo"); err != nil {
		return err
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("mirror synchronization incomplete (%d)", response.StatusCode)
	}
	return nil
}
