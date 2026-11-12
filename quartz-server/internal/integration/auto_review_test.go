package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/datamanager"
	"goblincwl/quartz-server/internal/httpapi"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAutoReviewPublishesOnlyVerifiedPendingFriends(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	ids := map[string]string{}
	for _, name := range []string{"a", "b", "c", "d"} {
		f, _, err := store.CreateFriend(ctx, community.Friend{Name: name, URL: "https://" + name + ".example/", BacklinkURL: "https://" + name + ".example/friends", Status: "待审核", ReviewResult: "spoofed", ReviewCheckedAt: "2099-01-01"}, false)
		if err != nil {
			t.Fatal(err)
		}
		if f.ReviewResult != "" || f.ReviewCheckedAt != "" {
			t.Fatal("client supplied a verification result")
		}
		ids[name] = f.ID
	}
	calls := 0
	store.CheckBacklink = func(ctx context.Context, f community.Friend) (community.BacklinkResult, error) {
		calls++
		switch f.Name {
		case "b":
			return community.BacklinkResult{Message: "未找到链接"}, nil
		case "c":
			return community.BacklinkResult{}, errors.New("HTTP 403")
		case "d":
			if _, err := db.ExecContext(ctx, "UPDATE friends SET status='已失效' WHERE id=?", f.ID); err != nil {
				t.Fatal(err)
			}
		}
		return community.BacklinkResult{Found: true, Message: "自动审核通过"}, nil
	}
	f, err := store.AutoReviewFriend(ctx, ids["a"])
	if err != nil || f.Status != "展示中" || f.ReviewCheckedAt == "" {
		t.Fatal(f, err)
	}
	if _, err = store.AutoReviewFriend(ctx, ids["a"]); err != nil || calls != 1 {
		t.Fatal("already approved friend rechecked", err, calls)
	}
	f, err = store.AutoReviewFriend(ctx, ids["b"])
	if err != nil || f.Status != "待审核" || f.ReviewResult != "未找到链接" {
		t.Fatal(f, err)
	}
	f, err = store.AutoReviewFriend(ctx, ids["c"])
	if err == nil || f.Status != "待审核" || !strings.Contains(f.ReviewResult, "403") {
		t.Fatal(f, err)
	}
	f, err = store.AutoReviewFriend(ctx, ids["d"])
	if err != nil || f.Status != "已失效" {
		t.Fatal("concurrent rejection overwritten", f, err)
	}
	public, err := store.Friends(ctx, true)
	if err != nil || len(public) != 1 {
		t.Fatal("unverified record exposed", public, err)
	}
	store.CheckBacklink = func(ctx context.Context, f community.Friend) (community.BacklinkResult, error) {
		if _, err := db.ExecContext(ctx, "UPDATE friends SET backlink_url='https://changed.example/friends' WHERE id=?", f.ID); err != nil {
			t.Fatal(err)
		}
		return community.BacklinkResult{Found: true, Message: "passed old page"}, nil
	}
	f, err = store.AutoReviewFriend(ctx, ids["b"])
	if err != nil || f.Status != "待审核" || f.ReviewResult == "passed old page" {
		t.Fatal("concurrent page edit overwritten", f, err)
	}
	manager := datamanager.Manager{DB: db}
	if _, err = manager.Save(ctx, "friends", map[string]any{"review_result": "fake approval"}, map[string]any{"id": ids["b"]}); err == nil {
		t.Fatal("generic API accepted forged review")
	}
	store.CheckBacklink = func(context.Context, community.Friend) (community.BacklinkResult, error) {
		return community.BacklinkResult{Found: true, Message: "passed retry"}, nil
	}
	result, err := store.RefreshLinks(ctx)
	if err != nil || result.Approved != 2 {
		t.Fatal("daily retry failed", result, err)
	}
	public, err = store.Friends(ctx, true)
	if err != nil || len(public) != 3 {
		t.Fatal(public, err)
	}
}

func TestPublicApplicationOnlySavesAndQueues(t *testing.T) {
	db := testDB(t)
	app := &httpapi.Server{DB: db, Origin: "https://site.test", Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	input := community.Friend{Name: "申请站点", URL: "https://127.0.0.1:1/", BacklinkURL: "https://127.0.0.1:1/friends", Avatar: "https://example.com/avatar.png", RSSURL: "https://127.0.0.1:1/feed", Description: "简介"}
	raw, _ := json.Marshal(input)
	req := httptest.NewRequest(http.MethodPost, "/api/site/friends/apply", bytes.NewReader(raw))
	req.Header.Set("Origin", "https://site.test")
	res := httptest.NewRecorder()
	app.Handler().ServeHTTP(res, req)
	if res.Code != 201 {
		t.Fatal("valid application lost after fetch failure", res.Code, res.Body.String())
	}
	var result struct {
		Application community.Friend `json:"application"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Application.Status != "待审核" || result.Application.ReviewResult != "" {
		t.Fatal("submission performed automatic review", res.Body.String())
	}
	var response map[string]map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil || response["application"]["queued"] != true {
		t.Fatal("missing queued submission receipt", res.Body.String(), err)
	}
	saved, err := (community.Store{DB: db}).Friends(context.Background(), false)
	if err != nil || len(saved) != 1 || saved[0].ReviewResult != "" || saved[0].LatestUpdate != "" || saved[0].Avatar != input.Avatar {
		t.Fatal(saved, err)
	}
	var queued int
	if err := db.QueryRow("SELECT count(*) FROM friend_jobs WHERE friend_id=? AND state='pending'", saved[0].ID).Scan(&queued); err != nil || queued != 1 {
		t.Fatal("task was not persisted with application", queued, err)
	}
	public, err := (community.Store{DB: db}).Friends(context.Background(), true)
	if err != nil || len(public) != 0 {
		t.Fatal("failed check published a record", public, err)
	}
}
