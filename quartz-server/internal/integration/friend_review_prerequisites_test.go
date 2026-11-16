package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/datamanager"
	"strings"
	"testing"
	"time"
)

func TestFriendReviewRequiresHealthyResources(t *testing.T) {
	for _, failure := range []string{"homepage", "rss", "avatar"} {
		t.Run(failure, func(t *testing.T) {
			db := testDB(t)
			ctx := context.Background()
			down := true
			reviews := 0
			store := community.Store{DB: db,
				CheckHomepage: func(context.Context, string) error {
					if down && failure == "homepage" {
						return errors.New("offline")
					}
					return nil
				},
				ReadFeed: func(context.Context, string) (time.Time, error) {
					if down && failure == "rss" {
						return time.Time{}, errors.New("RSS failed")
					}
					return time.Now(), nil
				},
				StoreAvatar: func(context.Context, string) (string, error) {
					if down && failure == "avatar" {
						return "", errors.New("compression failed")
					}
					return "/static/checked.png", nil
				},
				CheckBacklink: func(context.Context, community.Friend) (community.BacklinkResult, error) {
					reviews++
					return community.BacklinkResult{Found: true}, nil
				},
			}
			f, _, err := store.CreateFriend(ctx, community.Friend{Name: failure, Email: "fixture@example.test", URL: "https://" + failure + ".example", BacklinkURL: "https://" + failure + ".example/friends", Avatar: "https://" + failure + ".example/avatar.png", RSSURL: "https://" + failure + ".example/feed", Description: "fixture"}, true)
			if err != nil {
				t.Fatal(err)
			}
			if err = store.ProcessFriendJob(ctx, f.ID); err == nil {
				t.Fatal("failed prerequisite accepted")
			}
			if reviews != 0 {
				t.Fatal("auto approval ran after failed prerequisite")
			}
			if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{Status: "展示中"}, "review", 0); err == nil {
				t.Fatal("manual approval bypassed prerequisite")
			}
			if _, err = (datamanager.Manager{DB: db}).Save(ctx, "friends", map[string]any{"status": "展示中"}, map[string]any{"id": f.ID}); err == nil {
				t.Fatal("generic editor bypassed prerequisite")
			}
			var status string
			db.QueryRow("SELECT status FROM friends WHERE id=?", f.ID).Scan(&status)
			if status != "待审核" {
				t.Fatal(status)
			}
			down = false
			if err = store.ProcessFriendJob(ctx, f.ID); err != nil {
				t.Fatal("healthy resources rejected", err)
			}
			if reviews != 1 {
				t.Fatal("missing automatic review", reviews)
			}
			if err = store.ProcessFriendJob(ctx, f.ID); err != nil {
				t.Fatal("inspection failed", err)
			}
			if _, err = store.AutoReviewFriend(ctx, f.ID); err != nil {
				t.Fatal(err)
			}
			if reviews != 1 {
				t.Fatal("automatic review repeated after approval", reviews)
			}
		})
	}
}
func TestManualApprovalAfterResourceChecksSkipsFurtherAutoReview(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	reviews := 0
	store := community.Store{DB: db, CheckHomepage: func(context.Context, string) error { return nil }, StoreAvatar: func(context.Context, string) (string, error) { return "/static/checked.png", nil }, CheckBacklink: func(context.Context, community.Friend) (community.BacklinkResult, error) {
		reviews++
		return community.BacklinkResult{}, nil
	}}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "manual", Email: "fixture@example.test", URL: "https://manual.example", BacklinkURL: "https://manual.example/friends", Avatar: "https://manual.example/avatar.png", Description: "fixture"}, true)
	if err != nil {
		t.Fatal(err)
	}
	if err = store.ProcessFriendJob(ctx, f.ID); err == nil || !strings.Contains(err.Error(), "回链") {
		t.Fatal(err)
	}
	if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{Status: "展示中"}, "review", 0); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = store.ProcessFriendJob(ctx, f.ID); err != nil {
			t.Fatal(err)
		}
	}
	if reviews != 1 {
		t.Fatal("manual approval repeated automatic review", reviews)
	}
}
