package application

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/adapters"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/buildcontrol"
	"goblincwl/quartz-server/internal/cache"
	"goblincwl/quartz-server/internal/comments"
	"goblincwl/quartz-server/internal/content"
	"goblincwl/quartz-server/internal/credentials"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/jellyfin"
	"goblincwl/quartz-server/internal/journal"
	"goblincwl/quartz-server/internal/monitoring"
	"goblincwl/quartz-server/internal/openlist"
	"goblincwl/quartz-server/internal/repo"
	"goblincwl/quartz-server/internal/settings"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
	"goblincwl/quartz-server/internal/video"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Options struct{ AuthDirectory, OpenListDB, BeszelDB, RepoRoot, RepoCatalog, RepoOwner, VideoMID, DiaryDirectory, ArticleSnapshot, ArticleDirectory, PublicDirectory, JellyfinDB, GitHubMirrorTokenFile, EventsSocket string }

func Environment(authDirectory string) Options {
	env := func(key, fallback string) string {
		if value := os.Getenv(key); value != "" {
			return value
		}
		return fallback
	}
	return Options{AuthDirectory: authDirectory, OpenListDB: env("OPENLIST_DB", "/sources/openlist/data.db"), BeszelDB: env("BESZEL_DB", "/sources/beszel/data.db"), RepoRoot: env("REPO_ROOT", "/sources/repositories/goblincwl"), RepoCatalog: env("REPO_CATALOG", "/sources/repo-catalog/repositories.json"), RepoOwner: env("REPO_OWNER", "GoblinCwl"), VideoMID: env("BILIBILI_MID", "13536815"), DiaryDirectory: env("DIARY_PATH", "/sources/diaries"), ArticleSnapshot: env("ARTICLE_SNAPSHOT", "/snapshots/articles-index.json"), ArticleDirectory: env("ARTICLE_DIRECTORY", "/sources/notes"), PublicDirectory: env("PUBLIC_DIR", "/public"), JellyfinDB: env("JELLYFIN_DB", "/sources/jellyfin/jellyfin.db"), EventsSocket: env("QUARTZ_EVENTS_SOCKET", "/run/quartz-events/published.sock"), GitHubMirrorTokenFile: env("GITHUB_MIRROR_TOKEN_FILE", "/sources/github-secret/github-token")}
}

type Runtime struct {
	ctx                context.Context
	cancel             context.CancelFunc
	wg                 sync.WaitGroup
	taskMu             sync.Mutex
	closed             bool
	once               sync.Once
	startOnce          sync.Once
	app                *httpapi.Server
	options            Options
	repoSocial         *repo.Social
	videoSocial        *video.Social
	sources            cache.Cache
	videoIndexUpdates  chan struct{}
	friendJobsWake     chan struct{}
	settingsCache      cache.Cache
	articleIndex       *eventTask
	commentPermissions *eventTask
	mirrorCredential   *eventTask
	eventsServer       *http.Server
}

func New(ctx context.Context, app *httpapi.Server, options Options) (runtime *Runtime, err error) {
	root, cancel := context.WithCancel(ctx)
	runtime = &Runtime{ctx: root, cancel: cancel, app: app, options: options, videoIndexUpdates: make(chan struct{}, 1), friendJobsWake: make(chan struct{}, 1)}
	allocated := runtime
	defer func() {
		if err != nil {
			allocated.Close()
		}
	}()
	if app.Log == nil {
		app.Log = slog.Default()
	}
	read := func(ctx context.Context) (map[string]any, error) {
		return allocated.settingsCache.Get(ctx, "private-settings", 500*time.Millisecond, false, func(ctx context.Context) (map[string]any, error) {
			return (settings.Store{DB: app.DB}).Read(ctx, false)
		})
	}
	values, readErr := read(root)
	if readErr != nil {
		return nil, readErr
	}
	config := taskconfig.New(values)
	root = taskconfig.With(root, config)
	app.TaskRuns = taskruns.New(app.DB)
	app.TaskRuns.Config = config
	if err = app.TaskRuns.Recover(root); err != nil {
		return nil, err
	}
	root = taskruns.With(root, app.TaskRuns)
	runtime.ctx = root
	publishObserver := func() {
		if options.EventsSocket != "" {
			if err := taskconfig.WriteObserver(filepath.Join(filepath.Dir(options.EventsSocket), "task-config.json"), taskconfig.Duration(root, "container-observer")); err != nil {
				app.Log.Error("observer task configuration export failed", "error", err)
			}
		}
	}
	publishObserver()
	app.Credentials, err = credentials.New(app.DB, filepath.Join(options.AuthDirectory, "totp.key"))
	if err != nil {
		return nil, err
	}
	app.OpenList, err = openlist.Open(options.OpenListDB)
	if err != nil {
		return nil, err
	}
	app.ShareSession = &openlist.Session{ReadSettings: read}
	app.FriendAvatars = &openlist.Avatars{Session: app.ShareSession, Settings: read}
	app.FriendJobsChanged = runtime.requestFriendJobs
	app.ArticleDirectory = options.ArticleDirectory
	app.Build = &buildcontrol.Client{Directory: filepath.Dir(options.ArticleSnapshot)}
	app.Monitoring, err = monitoring.Open(root, options.BeszelDB, read)
	if err != nil {
		return nil, err
	}
	app.Monitoring.Registry = &monitoring.Registry{DB: app.DB, Key: app.Credentials.Key}
	app.Adapters = &adapters.Manager{DB: app.DB, Settings: read, DiaryDirectory: options.DiaryDirectory}
	app.Repo = &repo.Adapter{Owner: options.RepoOwner, Root: options.RepoRoot, CatalogFile: options.RepoCatalog, Origin: func(ctx context.Context) (string, error) {
		values, err := read(ctx)
		if err != nil {
			return "", err
		}
		value, _ := values["api.gitea.url"].(string)
		return value, nil
	}, GitHubToken: func(ctx context.Context) (string, error) { return app.Credentials.Read(ctx, "github") }}
	runtime.repoSocial = &repo.Social{DB: app.DB, Adapter: app.Repo, AfterCodeChange: runtime.syncRepoMirrors}
	app.Repo.Social = runtime.repoSocial.Snapshot
	store := video.Store{DB: app.DB, MID: options.VideoMID}
	client := &video.Client{MID: options.VideoMID, Cookie: func(ctx context.Context) (string, error) { return app.Credentials.Read(ctx, "bilibili") }}
	runtime.videoSocial = &video.Social{Store: store, Client: client}
	controller, err := video.NewController(root, store, client)
	if err != nil {
		return nil, err
	}
	controller.AfterSync = func(context.Context) error { runtime.requestVideoIndex(); return nil }
	app.DataChanged = func(table string) {
		if table == "videos" || table == "video-meta" {
			runtime.requestVideoIndex()
		}
	}
	controller.Social = runtime.videoSocial.Refresh
	app.Video = &video.Service{Store: store, Client: client, Controller: controller, Social: runtime.videoSocial, Changed: runtime.requestVideoIndex}
	artalk := &comments.Client{Settings: read}
	app.Comments = &comments.Archive{Client: artalk, Site: "GoblinCwl 的微光集", Origin: app.Origin, Pages: func(ctx context.Context) (map[string]comments.Page, error) {
		raw, err := os.ReadFile(filepath.Join(options.PublicDirectory, "static/contentIndex.json"))
		if err != nil {
			return nil, err
		}
		pages, err := comments.DecodeStaticPages(raw)
		if err != nil {
			return nil, err
		}
		entries, err := app.OpenList.Entries(ctx)
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			if entry.Kind == "share" {
				key := comments.ShareKey(entry.ID)
				pages[key] = comments.Page{Slug: key, Title: entry.ID, PublicPath: key}
			}
		}
		return pages, nil
	}}
	app.Shares = &openlist.Shares{Adapter: app.OpenList, Artalk: artalk, Settings: read, Site: app.Comments.Site, Changed: func(_ context.Context, before, after string) {
		app.Comments.Cache.Invalidate()
		app.Shares.IndexCache.Invalidate()
		ctx, cancel := context.WithTimeout(root, 30*time.Second)
		defer cancel()
		if before != "" && after != "" && before != after {
			if err := (content.Store{DB: app.DB, Origin: app.Origin}).RenameShare(ctx, before, after); err != nil {
				app.Log.Error("share index rename failed")
				return
			}
		}
		if err := runtime.syncSource(ctx, "share"); err != nil {
			app.Log.Warn("share index refresh deferred")
		}
	}}

	mediaBackend, err := jellyfin.NewBackend(root, options.JellyfinDB, app.OpenList, app.Shares, read)
	if err != nil {
		return nil, err
	}
	app.Jellyfin = jellyfin.NewService(root, mediaBackend, app.Origin)
	permissions := &comments.Permissions{DB: app.DB, Client: app.Comments.Client, SnapshotPath: options.ArticleSnapshot, Site: app.Comments.Site}
	runtime.commentPermissions = newEventTask("comment-permissions", 2*time.Minute, permissions.Refresh)
	snapshot := &content.ArticleSnapshot{Store: content.Store{DB: app.DB, Origin: app.Origin}, Path: options.ArticleSnapshot}
	runtime.articleIndex = newEventTask("article-index", 60*time.Second, func(ctx context.Context) error {
		if err := snapshot.Import(ctx); err != nil {
			return err
		}
		runtime.commentPermissions.request()
		return nil
	})
	runtime.mirrorCredential = newEventTask("gitea-mirror-credential", 10*time.Second, runtime.projectGitHubToken)
	app.SettingsChanged = func(key string) {
		app.Jellyfin.Danmaku.Invalidate()
		app.Jellyfin.Catalog.Details.Invalidate()
		allocated.settingsCache.Invalidate()
		if strings.HasPrefix(key, "tasks.") {
			if values, err := (settings.Store{DB: app.DB}).Read(root, false); err == nil {
				config.Reload(values)
				publishObserver()
			} else {
				app.Log.Error("task settings reload failed", "error", err)
			}
		}
		app.Adapters.Cache.Invalidate()
		app.Repo.Cache.Invalidate()
		app.Comments.Cache.Invalidate()
		app.Shares.IndexCache.Invalidate()
		runtime.commentPermissions.request()
	}
	app.CredentialChanged = func(id string) {
		app.Repo.Cache.Invalidate()
		if id == "github" {
			runtime.mirrorCredential.request()
			runtime.goTask(func(ctx context.Context) {
				if err := taskruns.Run(ctx, "github-social", runtime.repoSocial.Refresh); err != nil && ctx.Err() == nil {
					app.Log.Warn("GitHub refresh deferred")
				}
			})
		}
		if id == "bilibili" {
			app.Video.Controller.Start()
		}
	}
	if options.EventsSocket != "" {
		server, listener, err := buildcontrol.ListenPublished(options.EventsSocket, runtime.articleIndex.request)
		if err != nil {
			return nil, err
		}
		runtime.eventsServer = server
		runtime.goTask(func(context.Context) {
			if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
				app.Log.Error("build event listener stopped")
			}
		})
	}
	return runtime, nil
}
func (r *Runtime) goTask(work func(context.Context)) {
	r.taskMu.Lock()
	defer r.taskMu.Unlock()
	if r.closed {
		return
	}
	r.wg.Add(1)
	go func() { defer r.wg.Done(); work(r.ctx) }()
}
func (r *Runtime) periodic(name string, timeout time.Duration, work func(context.Context) error) {
	r.goTask(func(root context.Context) {
		run := func() {
			ctx, cancel := context.WithTimeout(root, timeout)
			defer cancel()
			if err := taskruns.Run(ctx, name, work); err != nil && root.Err() == nil {
				alerts.Emit(alerts.Event{Kind: "task", Source: alerts.TaskName(name), Title: "后台任务执行失败", Message: "保留已有数据；请检查对应服务与接入配置"})
				r.app.Log.Warn("background refresh failed; retaining existing data", "task", name)
			}
		}
		run()
		ticker := taskconfig.NewTicker(root, name)
		defer ticker.Stop()
		for {
			select {
			case <-root.Done():
				return
			case <-ticker.C:
				run()
			}
		}
	})
}
func (r *Runtime) syncSource(ctx context.Context, kind string) error {
	_, err := r.sources.Get(ctx, kind, 0, false, func(ctx context.Context) (map[string]any, error) {
		var items []content.Item
		var err error
		switch kind {
		case "share":
			items, err = r.app.Shares.Content(ctx)
		case "repo":
			items, err = r.app.Repo.Content(ctx)
		case "video":
			items, err = r.app.Video.Store.Content(ctx)
		default:
			return nil, errors.New("unknown index source")
		}
		if err != nil {
			return nil, err
		}
		if err = (content.Store{DB: r.app.DB, Origin: r.app.Origin}).Sync(ctx, kind, items); err != nil {
			return nil, err
		}
		return map[string]any{}, nil
	})
	return err
}
func (r *Runtime) Start() {
	r.startOnce.Do(r.start)
}
func (r *Runtime) start() {
	r.goTask(r.runFriendJobs)
	for _, task := range []*eventTask{r.articleIndex, r.commentPermissions, r.mirrorCredential} {
		r.goTask(func(ctx context.Context) { task.run(ctx, r.app.Log) })
	}
	r.articleIndex.request()
	r.mirrorCredential.request()
	for _, kind := range []string{"share", "repo"} {
		r.periodic("index-"+kind, 60*time.Second, func(ctx context.Context) error {
			if err := r.syncSource(ctx, kind); err != nil {
				return err
			}
			if kind == "repo" {
				return r.repoSocial.RefreshMirroredActivities(ctx)
			}
			return nil
		})
	}
	r.periodic("service-journal", 10*time.Second, func(ctx context.Context) error {
		return (journal.Store{DB: r.app.DB}).ServiceFile(ctx, filepath.Join(filepath.Dir(r.options.ArticleSnapshot), "observer-state.json"))
	})
	r.periodic("build-journal", 10*time.Second, func(ctx context.Context) error {
		return (journal.Store{DB: r.app.DB}).BuildFile(ctx, filepath.Join(filepath.Dir(r.options.ArticleSnapshot), "build-state.json"))
	})
	r.periodic("github-social", 40*time.Minute, r.repoSocial.Refresh)
	r.periodic("bilibili-social", 2*time.Minute, func(ctx context.Context) error { return r.videoSocial.Refresh(ctx, false) })
	r.periodic("activitywatch-summary", 90*time.Second, r.app.Adapters.RefreshSummary)
	r.periodic("auth-cleanup", 10*time.Second, r.app.Auth.Cleanup)
	r.dailyFriends()
	r.goTask(func(ctx context.Context) {
		for ctx.Err() == nil {
			err := adapters.WatchAttendance(ctx, r.options.DiaryDirectory, time.Minute, r.app.Adapters.RefreshAttendance, func(err error) {
				_ = taskruns.Run(ctx, "attendance-watch", func(context.Context) error { return err })
				r.app.Log.Warn("calendar refresh failed; retaining previous data")
			})
			if err != nil && ctx.Err() == nil {
				_ = taskruns.Run(ctx, "attendance-watch", func(context.Context) error { return err })
				r.app.Log.Warn("calendar watcher unavailable; retrying")
			}
			if !taskconfig.Wait(ctx, "attendance-retry", nil) {
				return
			}
		}
	})
	r.goTask(r.watchVideoIndex)
	r.requestVideoIndex()
	r.app.Video.Controller.Start()
}
func (r *Runtime) Close() {
	r.once.Do(func() {
		r.taskMu.Lock()
		r.closed = true
		r.cancel()
		r.taskMu.Unlock()
		if r.eventsServer != nil {
			r.eventsServer.Close()
		}
		if r.app.Video != nil && r.app.Video.Controller != nil {
			r.app.Video.Controller.Close()
		}
		r.wg.Wait()
		if r.app.Jellyfin != nil {
			r.app.Jellyfin.Close()
			r.app.Jellyfin.Backend.Library.Close()
		}
		if r.app.Monitoring != nil {
			r.app.Monitoring.Close()
		}
		if r.app.OpenList != nil {
			r.app.OpenList.DB.Close()
		}
	})
}
