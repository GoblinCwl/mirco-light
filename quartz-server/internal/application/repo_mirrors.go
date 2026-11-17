package application

import (
	"context"
	"fmt"
	"goblincwl/quartz-server/internal/taskruns"
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
	taskruns.Note(ctx, "请求同步服务：拉取 GitHub 仓库并同步 Gitea 镜像")
	response, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("mirror control unavailable: %w", err)
	}
	defer response.Body.Close()
	// Even a partial pull may contain successful repositories; import those now.
	taskruns.Note(ctx, "同步服务已返回，刷新本站仓库索引与镜像动态")
	r.app.Repo.Cache.Invalidate()
	r.sources.Invalidate()
	if err = r.syncSource(ctx, "repo"); err != nil {
		return err
	}
	if err = r.repoSocial.RefreshMirroredActivities(ctx); err != nil {
		return err
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("mirror synchronization incomplete (%d)", response.StatusCode)
	}
	return nil
}

// runRepoMirrorTasks is manually requested; failures remain visible for explicit retry.
func (r *Runtime) runRepoMirrorTasks(root context.Context) {
	pending := make(chan struct{}, 1)
	request := func(context.Context) error {
		select {
		case pending <- struct{}{}:
		default:
		}
		return nil
	}
	r.app.TaskRuns.RegisterTrigger("gitea-mirror-sync", request)
	r.app.TaskRuns.RegisterRetry("gitea-mirror-sync", request)
	for {
		select {
		case <-root.Done():
			return
		case <-pending:
		}
		ctx, cancel := context.WithTimeout(root, 36*time.Minute)
		_ = taskruns.Run(ctx, "gitea-mirror-sync", r.syncRepoMirrors)
		cancel()
	}
}
