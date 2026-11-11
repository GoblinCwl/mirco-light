package main

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/application"
	"goblincwl/quartz-server/internal/auth"
	"goblincwl/quartz-server/internal/config"
	"goblincwl/quartz-server/internal/database"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/visitors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	c, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startup, cancel := context.WithTimeout(ctx, 15*time.Second)
	db, err := database.Open(startup, c.DatabaseDSN)
	cancel()
	if err != nil {
		return err
	}
	defer db.Close()
	recorder := alerts.NewRecorder(db, slog.Default())
	alerts.SetDefault(recorder)
	defer recorder.Close()
	authentication, err := auth.New(db, c.AuthDir)
	if err != nil {
		return err
	}
	if err = authentication.Validate(ctx); err != nil {
		return err
	}
	identityKey, err := os.ReadFile(filepath.Join(c.AuthDir, "identity.key"))
	if err != nil {
		return err
	}
	if len(identityKey) != 32 {
		return errors.New("invalid visitor identity key")
	}
	visitorStore := &visitors.Store{DB: db, Secret: identityKey}
	geo, err := visitors.NewGeo(ctx, db)
	if err != nil {
		slog.Warn("GeoIP dataset unavailable in MySQL; retaining stored regions")
	} else {
		defer geo.Close()
		visitorStore.Locate = geo.Lookup
	}
	app := &httpapi.Server{DB: db, Log: slog.Default(), Origin: c.Origin, Auth: authentication, Visitors: visitorStore}
	runtime, err := application.New(ctx, app, application.Environment(c.AuthDir))
	if err != nil {
		return err
	}
	defer runtime.Close()
	runtime.Start()
	// No global write timeout: media streams are intentionally long lived.
	srv := &http.Server{Addr: c.Listen, Handler: app.Handler(), BaseContext: func(net.Listener) context.Context { return ctx }, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second, MaxHeaderBytes: 1 << 20}
	failed := make(chan error, 1)
	go func() { slog.Info("quartz-server listening", "address", c.Listen); failed <- srv.ListenAndServe() }()
	select {
	case err := <-failed:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
	}
	shutdown, close := context.WithTimeout(context.Background(), c.ShutdownTimeout)
	defer close()
	if err := srv.Shutdown(shutdown); err != nil {
		_ = srv.Close()
		return err
	}
	return nil
}
