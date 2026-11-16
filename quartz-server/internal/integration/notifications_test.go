package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/datamanager"
	"goblincwl/quartz-server/internal/notifications"
	"goblincwl/quartz-server/internal/settings"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMicroLightNotifications(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	cfg := settings.Store{DB: db}
	store := notifications.Store{DB: db, Key: bytes.Repeat([]byte{7}, 32)}
	count := func() int {
		t.Helper()
		var n int
		if err := db.QueryRow("SELECT count(*) FROM notification_outbox").Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	tx, _ := db.BeginTx(ctx, nil)
	if err := notifications.EnqueueTx(ctx, tx, notifications.Event{Kind: "feedback", RecordID: "disabled"}); err != nil {
		t.Fatal(err)
	}
	tx.Commit()
	if count() != 0 {
		t.Fatal("disabled channel queued history")
	}
	for k, v := range map[string]any{"notify.astrbot.enabled": true, "notify.astrbot.feedback": true, "notify.astrbot.alerts": true} {
		if _, err := cfg.Save(ctx, k, v); err != nil {
			t.Fatal(err)
		}
	}
	tx, _ = db.BeginTx(ctx, nil)
	if err := notifications.EnqueueTx(ctx, tx, notifications.Event{Kind: "feedback", RecordID: "rollback"}); err != nil {
		t.Fatal(err)
	}
	tx.Rollback()
	if count() != 0 {
		t.Fatal("event survived rollback")
	}
	token, err := store.Rotate(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(token) < 40 {
		t.Fatal("weak token")
	}
	if read, err := store.Token(ctx); err != nil || read != token {
		t.Fatal("token encryption roundtrip failed")
	}
	description, err := store.Describe(ctx)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(description)
	if strings.Contains(string(raw), token) {
		t.Fatal("token leaked in status")
	}
	next, err := store.Rotate(ctx)
	if err != nil || next == token {
		t.Fatal("token rotation failed")
	}
	token = next
	feedback, err := (community.Store{DB: db}).Submit(ctx, community.Feedback{Email: "private@example.test", Description: "fixture feedback"}, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	if count() != 1 {
		t.Fatal("feedback did not enqueue")
	}
	var payload string
	db.QueryRow("SELECT payload FROM notification_outbox LIMIT 1").Scan(&payload)
	if strings.Contains(payload, feedback.Email) {
		t.Fatal("email leaked")
	}
	if err = (community.Store{DB: db}).UpdateFeedback(ctx, feedback.ID, "已解决", false); err != nil {
		t.Fatal(err)
	}
	if count() != 2 {
		t.Fatal("status change did not enqueue")
	}
	if err = (community.Store{DB: db}).UpdateFeedback(ctx, feedback.ID, "已解决", false); err != nil {
		t.Fatal(err)
	}
	if count() != 2 {
		t.Fatal("unchanged status notified")
	}
	event := alerts.Event{Kind: "runtime", Level: "warning", Source: "fixture", Title: "test incident"}
	for i := 0; i < 2; i++ {
		if err = (alerts.Store{DB: db}).Record(ctx, event); err != nil {
			t.Fatal(err)
		}
	}
	if count() != 3 {
		t.Fatal("repeated incident notified twice")
	}
	event.Level = "error"
	if err = (alerts.Store{DB: db}).Record(ctx, event); err != nil {
		t.Fatal(err)
	}
	if count() != 4 {
		t.Fatal("severity upgrade missing")
	}
	if _, err = cfg.Save(ctx, "api.astrbot.token", "test-plugin-api-key"); err != nil {
		t.Fatal(err)
	}
	var ids []string
	badAck := true
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "test-plugin-api-key" {
			t.Error("missing shared AstrBot plugin API key")
		}
		if r.Header.Get("X-MicroLight-Token") != token {
			t.Error("wrong delivery token")
		}
		var e notifications.Event
		json.NewDecoder(r.Body).Decode(&e)
		ids = append(ids, e.ID)
		if badAck {
			w.Write([]byte(`{"accepted":true,"id":"wrong"}`))
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"accepted": true, "id": e.ID})
	}))
	defer receiver.Close()
	if _, err = cfg.Save(ctx, "notify.astrbot.url", receiver.URL); err != nil {
		t.Fatal(err)
	}
	if worked, err := store.Deliver(ctx, receiver.Client()); err != nil || !worked {
		t.Fatal("first delivery failed", err)
	}
	var attempt int
	var last string
	db.QueryRow("SELECT attempts,last_error FROM notification_outbox WHERE id=?", ids[0]).Scan(&attempt, &last)
	if attempt != 1 || last == "" {
		t.Fatal("invalid ack marked delivered")
	}
	if err = store.Retry(ctx, ids[0]); err != nil {
		t.Fatal(err)
	}
	db.Exec("UPDATE notification_outbox SET available_at=? WHERE id=?", time.Now().Add(-time.Hour).UnixMilli(), ids[0])
	badAck = false
	if worked, err := store.Deliver(ctx, receiver.Client()); err != nil || !worked {
		t.Fatal(err)
	}
	if len(ids) != 2 || ids[0] != ids[1] {
		t.Fatal("retry changed event ID")
	}
	var state string
	db.QueryRow("SELECT state FROM notification_outbox WHERE id=?", ids[0]).Scan(&state)
	if state != "delivered" {
		t.Fatal(state)
	}
	if err = store.Retry(ctx, ids[0]); err == nil {
		t.Fatal("delivered notification resent")
	}
	if _, err = (datamanager.Manager{DB: db}).Save(ctx, "feedback", map[string]any{"status": "待处理"}, map[string]any{"id": feedback.ID}); err != nil {
		t.Fatal(err)
	}
	if count() != 5 {
		t.Fatal("generic editor did not notify status change")
	}
}

func TestMicroLightFriendEvents(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	cfg := settings.Store{DB: db}
	if _, err := cfg.Save(ctx, "notify.astrbot.enabled", true); err != nil {
		t.Fatal(err)
	}
	store := community.Store{DB: db, CheckBacklink: func(context.Context, community.Friend) (community.BacklinkResult, error) {
		return community.BacklinkResult{Found: true, Message: "已确认"}, nil
	}}
	f, _, err := store.CreateFriend(ctx, community.Friend{Email: "fixture@example.test", Name: "fixture", Avatar: "https://fixture.example/avatar.png", Description: "fixture", URL: "https://fixture.example", BacklinkURL: "https://fixture.example/friends"}, true)
	if err != nil {
		t.Fatal(err)
	}
	var before int
	db.QueryRow("SELECT count(*) FROM notification_outbox WHERE kind='friends'").Scan(&before)
	if before != 0 {
		t.Fatal("application notified before approval")
	}
	db.Exec("UPDATE friends SET review_ready=1 WHERE id=?", f.ID)
	if _, err = store.AutoReviewFriend(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	db.Exec("UPDATE friends SET review_ready=1 WHERE id=?", f.ID)
	if _, err = store.AutoReviewFriend(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{Email: "fixture@example.test", Status: "已失效"}, "review", 0); err != nil {
		t.Fatal(err)
	}
	var n int
	if err = db.QueryRow("SELECT count(*) FROM notification_outbox WHERE kind='friends'").Scan(&n); err != nil || n != 1 {
		t.Fatalf("friend events: %d %v", n, err)
	}
	if _, err = cfg.Save(ctx, "notify.astrbot.friends", false); err != nil {
		t.Fatal(err)
	}
	if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{Email: "fixture@example.test", Status: "待审核"}, "review", 0); err != nil {
		t.Fatal(err)
	}
	db.QueryRow("SELECT count(*) FROM notification_outbox WHERE kind='friends'").Scan(&n)
	if n != 1 {
		t.Fatal("disabled friend notifications were queued")
	}
}
