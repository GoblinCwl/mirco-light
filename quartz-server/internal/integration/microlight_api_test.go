package integration

import (
	"bytes"
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/credentials"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/notifications"
	"goblincwl/quartz-server/internal/taskruns"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMicroLightAPI(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	key := bytes.Repeat([]byte{8}, 32)
	store := notifications.Store{DB: db, Key: key}
	s := &httpapi.Server{DB: db, Credentials: &credentials.Store{DB: db, Key: key}, Origin: "https://site.test"}
	handler := s.Handler()
	call := func(method, path, token string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, nil)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		r.Header.Set("Origin", s.Origin)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if w := call("GET", "/api/microlight/v1/status", ""); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := call("GET", "/api/microlight/v1/status", "invalid"); w.Code != 401 {
		t.Fatal(w.Code)
	}
	token, err := store.Rotate(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if w := call("GET", "/api/microlight/v1/status", token); w.Code != 200 || !strings.Contains(w.Body.String(), "alerts:read") {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, path := range []string{"alerts", "feedback", "friends"} {
		if w := call("GET", "/api/microlight/v1/"+path, token); w.Code != 200 {
			t.Fatal(path, w.Code, w.Body.String())
		}
	}
	if w := call("DELETE", "/api/microlight/v1/feedback/test", token); w.Code != 405 {
		t.Fatal("write accepted", w.Code)
	}
	for _, path := range []string{"/api/site/admin/settings", "/api/site/admin/api-token"} {
		if w := call("GET", path, token); w.Code != 401 {
			t.Fatal("token escalated to admin", path, w.Code)
		}
	}
	if w := call("GET", "/api/microlight/v1/status?token="+token, ""); w.Code != 401 {
		t.Fatal("query token accepted")
	}
	f, err := (community.Store{DB: db}).Submit(ctx, community.Feedback{Email: "fixture@example.test", Description: "API fixture"}, "test")
	if err != nil {
		t.Fatal(err)
	}
	if w := call("GET", "/api/microlight/v1/feedback/"+f.ID, token); w.Code != 200 || !strings.Contains(w.Body.String(), "API fixture") {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call("GET", "/api/microlight/v1/feedback/missing", token); w.Code != 404 {
		t.Fatal(w.Code)
	}
	if w := call("GET", "/api/microlight/v1/feedback?page=-1", token); w.Code != 400 {
		t.Fatal(w.Code)
	}

	if w := call("POST", "/api/microlight/v1/feedback/"+f.ID+"/resolve", ""); w.Code != 401 {
		t.Fatal("unauthenticated write", w.Code)
	}
	if w := call("POST", "/api/microlight/v1/feedback/"+f.ID+"/resolve", token); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var status string
	db.QueryRow("SELECT status FROM feedback WHERE id=?", f.ID).Scan(&status)
	if status != "已解决" {
		t.Fatal(status)
	}
	var feedbackMails int
	db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE kind='feedback' AND friend_id=?", f.ID).Scan(&feedbackMails)
	if feedbackMails != 1 {
		t.Fatal("AstrBot resolution did not enqueue mail", feedbackMails)
	}
	friend, _, err := (community.Store{DB: db}).CreateFriend(ctx, community.Friend{Email: "fixture@example.test", Name: "fixture", Avatar: "https://fixture.example/avatar.png", Description: "fixture", URL: "https://fixture.example", BacklinkURL: "https://fixture.example/friends"}, true)
	if err != nil {
		t.Fatal(err)
	}
	if w := call("POST", "/api/microlight/v1/friends/"+friend.ID+"/approve", token); w.Code == 200 {
		t.Fatal("API bypassed prerequisites")
	}
	db.Exec("UPDATE friends SET review_ready=1 WHERE id=?", friend.ID)
	if w := call("POST", "/api/microlight/v1/friends/auto-review", ""); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := call("POST", "/api/microlight/v1/friends/auto-review", token); w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	db.Exec("UPDATE friends SET review_ready=1 WHERE id=?", friend.ID)
	if w := call("POST", "/api/microlight/v1/friends/"+friend.ID+"/approve", token); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call("POST", "/api/microlight/v1/friends/"+friend.ID+"/reject", token); w.Code != 405 {
		t.Fatal("removed reject endpoint still accepted", w.Code)
	}
	db.QueryRow("SELECT status FROM friends WHERE id=?", friend.ID).Scan(&status)
	if status != "展示中" {
		t.Fatal("reject changed friend state", status)
	}

	for i := 0; i < 2; i++ {
		if w := call("POST", "/api/microlight/v1/friends/"+friend.ID+"/failure-mail", token); w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	var mailCount int
	db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE friend_id=? AND accepted=0", friend.ID).Scan(&mailCount)
	if mailCount != 1 {
		t.Fatal("failure mail endpoint not idempotent", mailCount)
	}
	if w := call("POST", "/api/microlight/v1/friends/"+friend.ID+"/abandon", ""); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := call("POST", "/api/microlight/v1/friends/"+friend.ID+"/abandon", token); w.Code == 200 {
		t.Fatal("abandoned below threshold")
	}
	db.Exec("UPDATE friends SET processing_failures=5 WHERE id=?", friend.ID)
	if w := call("POST", "/api/microlight/v1/friends/"+friend.ID+"/abandon", token); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var remaining int
	db.QueryRow("SELECT count(*) FROM friends WHERE id=?", friend.ID).Scan(&remaining)
	db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE friend_id=? AND accepted=0", friend.ID).Scan(&mailCount)
	if remaining != 0 || mailCount != 2 {
		t.Fatal("abandon did not delete and enqueue its mail", remaining, mailCount)
	}
	if w := call("DELETE", "/api/microlight/v1/alerts/not-a-number", token); w.Code != 400 {
		t.Fatal(w.Code)
	}
	if w := call("DELETE", "/api/microlight/v1/alerts/999999", token); w.Code != 404 {
		t.Fatal(w.Code)
	}
	if _, err = db.Exec("INSERT INTO alerts(fingerprint,kind,level,source,title,message,target,status_code,first_seen,last_seen,occurrences) VALUES('api-test','runtime','error','fixture','test','','',500,'2026-01-01','2026-01-01',1)"); err != nil {
		t.Fatal(err)
	}
	var alertID string
	if err = db.QueryRow("SELECT id FROM alerts WHERE source='fixture' AND title='test' ORDER BY id DESC LIMIT 1").Scan(&alertID); err != nil {
		t.Fatal(err)
	}
	if w := call("DELETE", "/api/microlight/v1/alerts/"+alertID, token); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call("GET", "/api/microlight/v1/alerts/"+alertID, token); w.Code != 404 {
		t.Fatal(w.Code)
	}
	tracker := taskruns.New(db)
	s.TaskRuns = tracker
	requested := 0
	tracker.RegisterRetry("article-index", func(context.Context) error { requested++; return nil })
	runCtx := taskruns.With(ctx, tracker)
	taskruns.Run(runCtx, "article-index", func(context.Context) error { return errors.New("fixture failure") })
	if w := call("GET", "/api/microlight/v1/tasks", token); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call("GET", "/api/microlight/v1/tasks/article-index", token); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call("POST", "/api/microlight/v1/tasks/article-index/retry", ""); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := call("POST", "/api/microlight/v1/tasks/article-index/retry", token); w.Code != 202 || requested != 1 {
		t.Fatal(w.Code, requested, w.Body.String())
	}
	if w := call("POST", "/api/microlight/v1/tasks/article-index/retry", token); w.Code != 409 || requested != 1 {
		t.Fatal("duplicate retry accepted", w.Code, requested)
	}
	if w := call("POST", "/api/microlight/v1/tasks/index-share/retry", token); w.Code != 409 {
		t.Fatal(w.Code)
	}
	rotated, err := store.Rotate(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if w := call("GET", "/api/microlight/v1/status", token); w.Code != 401 {
		t.Fatal("old token still accepted")
	}
	if w := call("GET", "/api/microlight/v1/status", rotated); w.Code != 200 {
		t.Fatal(w.Code)
	}
}
