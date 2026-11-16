package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"testing"
	"time"
)

func TestApprovedFriendNeverRunsAutomaticReviewAgain(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	backlinks := 0
	store := community.Store{DB: db, CheckHomepage: func(context.Context, string) error { return nil }, StoreAvatar: func(context.Context, string) (string, error) { return "", errors.New("avatar compression failed") }, ReadFeed: func(context.Context, string) (time.Time, error) { return time.Now(), nil }, CheckBacklink: func(context.Context, community.Friend) (community.BacklinkResult, error) {
		backlinks++
		return community.BacklinkResult{}, errors.New("must not run")
	}}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "approved", URL: "https://approved.example", BacklinkURL: "https://approved.example/friends", Avatar: "https://approved.example/avatar.png", RSSURL: "https://approved.example/feed", Status: "展示中"}, false)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = store.ProcessFriendJob(ctx, f.ID); err == nil {
			t.Fatal("inspection failure lost")
		}
		if _, err = store.AutoReviewFriend(ctx, f.ID); err != nil {
			t.Fatal("approved friend attempted review", err)
		}
	}
	if backlinks != 0 {
		t.Fatal("automatic review repeated", backlinks)
	}
	var status string
	db.QueryRow("SELECT status FROM friends WHERE id=?", f.ID).Scan(&status)
	if status != "展示中" {
		t.Fatal("inspection revoked approval", status)
	}
}
