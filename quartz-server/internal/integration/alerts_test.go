package integration

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/auth"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/journal"
	"goblincwl/quartz-server/internal/observer"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAlertsMergeAfterQuietGapAndFilter(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	now := time.Now().UTC()
	event := alerts.Event{Kind: "api", Source: "Bilibili", Title: "API failed", Message: "safe", Target: "https://user:secret@example.test/token?key=secret", Code: 503}
	for _, offset := range []time.Duration{0, time.Minute, 12 * time.Minute} {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		if err = alerts.RecordTx(ctx, tx, event, now.Add(offset)); err != nil {
			tx.Rollback()
			t.Fatal(err)
		}
		if err = tx.Commit(); err != nil {
			t.Fatal(err)
		}
	}
	store := alerts.Store{DB: db}
	result, err := store.List(ctx, 1, "api", "bilibili")
	if err != nil || result["total"] != 2 {
		t.Fatal(result, err)
	}
	records := result["records"].([]alerts.Record)
	if records[0].Occurrences != 1 || records[1].Occurrences != 2 || records[0].Target != "https://example.test" {
		t.Fatal(records)
	}
	if _, err = store.List(ctx, 1, "unknown", ""); err == nil {
		t.Fatal("accepted invalid filter")
	}
	result, err = store.List(ctx, 1, "service", "")
	if err != nil || result["total"] != 0 {
		t.Fatal("filter failed", result, err)
	}
}

func TestAlertsRetentionKeepsRecentlyRepeatedOldRecord(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	fingerprint := sha256.Sum256([]byte("seed"))
	values := []string{}
	args := []any{}
	for i := 0; i < 1000; i++ {
		values = append(values, "(?,?,?,?,?,?,?,?,?,?,1)")
		args = append(args, fingerprint[:], "runtime", "error", "seed", fmt.Sprint(i), "safe", "", 0, "2000-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z")
	}
	if _, err := db.Exec("INSERT INTO alerts(fingerprint,kind,level,source,title,message,target,status_code,first_seen,last_seen,occurrences) VALUES "+strings.Join(values, ","), args...); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("UPDATE alerts SET last_seen='2099-01-01T00:00:00.000Z' WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	if err := (alerts.Store{DB: db}).Record(ctx, alerts.Event{Kind: "task", Source: "fixture", Title: "New alert"}); err != nil {
		t.Fatal(err)
	}
	var total, kept, removed int
	db.QueryRow("SELECT count(*) FROM alerts").Scan(&total)
	db.QueryRow("SELECT count(*) FROM alerts WHERE id=1").Scan(&kept)
	db.QueryRow("SELECT count(*) FROM alerts WHERE id=2").Scan(&removed)
	if total != 1000 || kept != 1 || removed != 0 {
		t.Fatal("retention did not follow last occurrence", total, kept, removed)
	}
	result, err := (alerts.Store{DB: db}).List(ctx, 999, "", "")
	if err != nil || result["page"] != 50 || len(result["records"].([]alerts.Record)) != 20 {
		t.Fatal("pagination failed", result, err)
	}
}

func TestObserverFailuresRecordedOnceByExistingConsumer(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	filename := filepath.Join(t.TempDir(), "observer.json")
	snapshot := observer.Snapshot{States: map[string]observer.State{}, Events: []observer.Event{}, Failures: []observer.Failure{{ID: "failure:first", Service: "OpenList", Status: "offline", ObservedAt: time.Now().UTC().Format(time.RFC3339Nano)}}}
	write := func() {
		t.Helper()
		raw, _ := json.Marshal(snapshot)
		if err := os.WriteFile(filename, raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
	write()
	for range 2 {
		if err := (journal.Store{DB: db}).ServiceFile(ctx, filename); err != nil {
			t.Fatal(err)
		}
	}
	result, err := (alerts.Store{DB: db}).List(ctx, 1, "service", "")
	if err != nil || result["total"] != 1 || result["records"].([]alerts.Record)[0].Occurrences != 1 {
		t.Fatal("snapshot replay duplicated alert", result, err)
	}
	snapshot.Failures = append(snapshot.Failures, observer.Failure{ID: "failure:second", Service: "OpenList", Status: "offline", ObservedAt: time.Now().UTC().Format(time.RFC3339Nano)})
	write()
	if err := (journal.Store{DB: db}).ServiceFile(ctx, filename); err != nil {
		t.Fatal(err)
	}
	result, err = (alerts.Store{DB: db}).List(ctx, 1, "service", "")
	if err != nil || result["records"].([]alerts.Record)[0].Occurrences != 2 {
		t.Fatal("new failure missing", result, err)
	}
}

func TestAlertRecorderFlushesAndAPIRequiresAdministrator(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	recorder := alerts.NewRecorder(db, slog.New(slog.NewTextHandler(io.Discard, nil)))
	recorder.Emit(alerts.Event{Kind: "task", Source: "fixture", Title: "Queued alert"})
	recorder.Close()
	result, err := (alerts.Store{DB: db}).List(ctx, 1, "", "")
	if err != nil || result["total"] != 1 {
		t.Fatal("queued event lost at shutdown", result, err)
	}
	app := &httpapi.Server{DB: db, Origin: "https://site.test", Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	for _, path := range []string{"/api/site/admin/alerts", "/api/site/admin/alerts?page=1&kind=api"} {
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, httptest.NewRequest(http.MethodGet, path, nil))
		if res.Code != 401 {
			t.Fatal("alert records exposed", path, res.Code)
		}
	}
}

func TestAuthenticatedAlertListAndClear(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "totp.key"), []byte(strings.Repeat("01", 32)), 0600)
	service, err := auth.New(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	service.Now = func() time.Time { return now }
	if err = service.SetPassword(ctx, "alerts-fixture-password"); err != nil {
		t.Fatal(err)
	}
	setup, err := service.Login(ctx, "192.0.2.1", auth.Input{Password: "alerts-fixture-password"})
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := service.Confirm(ctx, "192.0.2.1", auth.Input{SetupToken: setup["setupToken"].(string), Code: currentCode(setup["secret"].(string), now)})
	if err != nil {
		t.Fatal(err)
	}
	logged, err := service.Finish(ctx, "192.0.2.1", auth.Input{CompletionToken: confirmed["completionToken"].(string), Saved: true})
	if err != nil {
		t.Fatal(err)
	}
	if err = (alerts.Store{DB: db}).Record(ctx, alerts.Event{Kind: "task", Source: "fixture", Title: "Queued alert"}); err != nil {
		t.Fatal(err)
	}
	app := &httpapi.Server{DB: db, Auth: service, Origin: "https://site.test", Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	api := app.Handler()
	for _, fixture := range []struct {
		method, path, origin string
		status               int
	}{{"GET", "/api/site/admin/alerts?kind=task&query=Queued", "", 200}, {"GET", "/api/site/admin/alerts?kind=invalid", "", 400}, {"POST", "/api/site/admin/alerts", "https://site.test", 405}, {"POST", "/api/site/admin/alerts", "https://evil.test", 403}} {
		req := httptest.NewRequest(fixture.method, fixture.path, nil)
		req.AddCookie(&http.Cookie{Name: "quartz_stellar_session", Value: logged["token"].(string)})
		if fixture.origin != "" {
			req.Header.Set("Origin", fixture.origin)
		}
		res := httptest.NewRecorder()
		api.ServeHTTP(res, req)
		if res.Code != fixture.status {
			t.Fatal(fixture, res.Code, res.Body.String())
		}
		if res.Code == 200 {
			var value map[string]any
			json.Unmarshal(res.Body.Bytes(), &value)
			if value["total"] != float64(1) {
				t.Fatal("filtered list failed", value)
			}
		}
	}
	for _, fixture := range []struct {
		authenticated bool
		origin        string
		status        int
	}{
		{false, "https://site.test", 401},
		{true, "https://evil.test", 403},
		{true, "https://site.test", 200},
	} {
		req := httptest.NewRequest(http.MethodDelete, "/api/site/admin/alerts", nil)
		req.Header.Set("Origin", fixture.origin)
		if fixture.authenticated {
			req.AddCookie(&http.Cookie{Name: "quartz_stellar_session", Value: logged["token"].(string)})
		}
		res := httptest.NewRecorder()
		api.ServeHTTP(res, req)
		if res.Code != fixture.status {
			t.Fatal("clear status", fixture, res.Code, res.Body.String())
		}
		result, err := (alerts.Store{DB: db}).List(ctx, 1, "", "")
		if err != nil {
			t.Fatal(err)
		}
		want := 1
		if fixture.status == 200 {
			want = 0
		}
		if result["total"] != want {
			t.Fatal("clear changed unexpected records", result)
		}
	}
	if err := (alerts.Store{DB: db}).Record(ctx, alerts.Event{Kind: "task", Source: "fixture", Title: "New failure"}); err != nil {
		t.Fatal(err)
	}
	result, err := (alerts.Store{DB: db}).List(ctx, 1, "", "")
	if err != nil || result["total"] != 1 {
		t.Fatal("new alerts stopped after clearing", result, err)
	}

}
