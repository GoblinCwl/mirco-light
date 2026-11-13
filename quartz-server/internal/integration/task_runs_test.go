package integration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/auth"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTaskRunHistoryRetentionRecoveryAndQueueDetails(t *testing.T) {
	db := testDB(t)
	tracker := taskruns.New(db)
	tracker.Config = taskconfig.New(nil)
	ctx := taskruns.With(context.Background(), tracker)
	for i := 0; i < 15; i++ {
		_ = taskruns.Run(ctx, "index-repo", func(ctx context.Context) error {
			taskruns.Note(ctx, fmt.Sprint("run ", i))
			if i%3 == 0 {
				return errors.New("download https://user:pass@example.test/path?token=secret")
			}
			return nil
		})
	}
	detail, err := tracker.Detail(ctx, "index-repo", 1)
	if err != nil {
		t.Fatal(err)
	}
	runs := detail["runs"].([]taskruns.RunRecord)
	if len(runs) != 10 || runs[0].Status != "success" || runs[2].Status != "failed" || strings.Contains(runs[2].Error, "secret") || !strings.Contains(runs[0].Logs, "run 14") {
		t.Fatal(runs)
	}
	// A process death leaves an explicit interrupted result, not a permanently running task.
	_, err = db.Exec("INSERT INTO task_runs(task_key,started_at,status,error,logs) VALUES('index-share',?,'running','','started')", time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
	if err = tracker.Recover(ctx); err != nil {
		t.Fatal(err)
	}
	detail, err = tracker.Detail(ctx, "index-share", 1)
	if err != nil || detail["runs"].([]taskruns.RunRecord)[0].Status != "interrupted" {
		t.Fatal(detail, err)
	}
	store := community.Store{DB: db}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "queued", URL: "https://queued.example/", BacklinkURL: "https://queued.example/friends"}, false)
	if err != nil {
		t.Fatal(err)
	}
	detail, err = tracker.Detail(ctx, "friend-jobs", 1)
	if err != nil {
		t.Fatal(err)
	}
	queue := detail["queue"].(taskruns.QueueView)
	if queue.Total != 1 || queue.Waiting != 1 || len(queue.Items) != 1 || queue.Items[0].Label != "queued" || queue.Items[0].ID != f.ID {
		t.Fatal(queue)
	}
	job, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil {
		t.Fatal(job, err)
	}
	detail, err = tracker.Detail(ctx, "friend-jobs", 1)
	if err != nil || detail["queue"].(taskruns.QueueView).Running != 1 {
		t.Fatal(detail, err)
	}
	state := taskruns.NewQueueState("changed")
	state.Start()
	tracker.RegisterQueue("article-index", func() []taskruns.QueueItem { return state.Snapshot(1) })
	detail, err = tracker.Detail(ctx, "article-index", 1)
	if err != nil || detail["queue"].(taskruns.QueueView).Total != 2 {
		t.Fatal(detail, err)
	}
	if _, err = tracker.Detail(ctx, "does-not-exist", 1); err == nil {
		t.Fatal("unknown task accepted")
	}
}
func TestTaskErrorsAndBackgroundAPIRequestsLeaveAlertCenter(t *testing.T) {
	db := testDB(t)
	tracker := taskruns.New(db)
	ctx := taskruns.With(context.Background(), tracker)
	recorder := alerts.NewRecorder(db, nil)
	alerts.SetDefault(recorder)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer server.Close()
	_ = taskruns.Run(ctx, "github-social", func(ctx context.Context) error {
		req, _ := http.NewRequestWithContext(ctx, "GET", server.URL, nil)
		res, err := alerts.Do(server.Client(), "fixture", req)
		if err != nil {
			return err
		}
		res.Body.Close()
		return errors.New("fixture failed")
	})
	alerts.Emit(alerts.Event{Kind: "task", Source: "fixture", Title: "periodic failure"})
	// Interactive requests still belong in the alert center.
	req, _ := http.NewRequest("GET", server.URL, nil)
	res, err := alerts.Do(server.Client(), "fixture", req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	recorder.Close()
	listed, err := (alerts.Store{DB: db}).List(ctx, 1, "", "")
	if err != nil || listed["total"] != 1 {
		t.Fatal(listed, err)
	}
	// Historical task incidents are also excluded from display.
	if err = (alerts.Store{DB: db}).Record(ctx, alerts.Event{Kind: "task", Source: "old", Title: "old task"}); err != nil {
		t.Fatal(err)
	}
	listed, err = (alerts.Store{DB: db}).List(ctx, 1, "", "")
	if err != nil || listed["total"] != 1 {
		t.Fatal(listed, err)
	}
	detail, err := tracker.Detail(ctx, "github-social", 1)
	if err != nil {
		t.Fatal(err)
	}
	run := detail["runs"].([]taskruns.RunRecord)[0]
	if run.Status != "failed" || !strings.Contains(run.Logs, "HTTP 503") {
		t.Fatal(run)
	}
	api := (&httpapi.Server{DB: db, TaskRuns: tracker}).Handler()
	response := httptest.NewRecorder()
	api.ServeHTTP(response, httptest.NewRequest("GET", "/api/site/admin/tasks", nil))
	if response.Code != 401 {
		t.Fatal("task logs exposed without admin session", response.Code)
	}
}

func TestTaskExternalHistoryDeduplicationAndPanicsAreRecorded(t *testing.T) {
	db := testDB(t)
	tracker := taskruns.New(db)
	ctx := taskruns.With(context.Background(), tracker)
	runs := []taskruns.RunRecord{}
	for i := 0; i < 12; i++ {
		key := fmt.Sprintf("observer-%d", i)
		at := time.Now().UTC().Add(time.Duration(i) * time.Second).Format(time.RFC3339Nano)
		runs = append(runs, taskruns.RunRecord{Key: "container-observer", RunKey: &key, StartedAt: at, FinishedAt: at, Status: "success", Logs: "observed"})
	}
	// Snapshots contain ten records, but repeated consumption must not duplicate them.
	if err := tracker.ImportBatch(ctx, "container-observer", runs[2:]); err != nil {
		t.Fatal(err)
	}
	if err := tracker.ImportBatch(ctx, "container-observer", runs[2:]); err != nil {
		t.Fatal(err)
	}
	second := taskruns.New(db)
	if err := second.ImportBatch(ctx, "container-observer", runs[2:]); err != nil {
		t.Fatal(err)
	}
	detail, err := tracker.Detail(ctx, "container-observer", 1)
	if err != nil || len(detail["runs"].([]taskruns.RunRecord)) != 10 {
		t.Fatal(detail, err)
	}
	if err := taskruns.Run(ctx, "index-share", func(context.Context) error { panic("fixture panic") }); err == nil {
		t.Fatal("panic result was not captured")
	}
	detail, err = tracker.Detail(ctx, "index-share", 1)
	if err != nil || detail["runs"].([]taskruns.RunRecord)[0].Status != "failed" {
		t.Fatal(detail, err)
	}
}

func TestAuthenticatedTaskInstancesAndQueuePagination(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "totp.key"), []byte(strings.Repeat("01", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	service, err := auth.New(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	service.Now = func() time.Time { return now }
	if err = service.SetPassword(ctx, "tasks-fixture-password"); err != nil {
		t.Fatal(err)
	}
	setup, err := service.Login(ctx, "192.0.2.1", auth.Input{Password: "tasks-fixture-password"})
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
	tracker := taskruns.New(db)
	tracker.RegisterQueue("article-index", func() []taskruns.QueueItem {
		items := []taskruns.QueueItem{}
		for i := 0; i < 45; i++ {
			items = append(items, taskruns.QueueItem{ID: fmt.Sprint(i), Label: fmt.Sprint("item ", i), State: "pending"})
		}
		return items
	})
	api := (&httpapi.Server{DB: db, Auth: service, Origin: "https://site.test", TaskRuns: tracker}).Handler()
	for _, fixture := range []struct {
		method, path string
		status       int
	}{{"GET", "/api/site/admin/tasks", 200}, {"GET", "/api/site/admin/tasks/article-index?page=3", 200}, {"GET", "/api/site/admin/tasks/unknown", 404}, {"GET", "/api/site/admin/tasks/article-index?page=-1", 400}, {"POST", "/api/site/admin/tasks", 405}} {
		request := httptest.NewRequest(fixture.method, fixture.path, nil)
		request.Header.Set("Origin", "https://site.test")
		request.AddCookie(&http.Cookie{Name: "quartz_stellar_session", Value: logged["token"].(string)})
		response := httptest.NewRecorder()
		api.ServeHTTP(response, request)
		if response.Code != fixture.status {
			t.Fatal(fixture, response.Code, response.Body.String())
		}
		if fixture.path == "/api/site/admin/tasks" && fixture.method == "GET" {
			var value struct {
				Tasks []taskruns.Instance `json:"tasks"`
			}
			if err = json.Unmarshal(response.Body.Bytes(), &value); err != nil || len(value.Tasks) != len(taskruns.Definitions) {
				t.Fatal(err, response.Body.String())
			}
		}
		if strings.Contains(fixture.path, "page=3") {
			var value struct {
				Queue taskruns.QueueView `json:"queue"`
			}
			if err = json.Unmarshal(response.Body.Bytes(), &value); err != nil || value.Queue.Total != 45 || len(value.Queue.Items) != 5 || value.Queue.Page != 3 {
				t.Fatal(value, err)
			}
		}
	}
}
