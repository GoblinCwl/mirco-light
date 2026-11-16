package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"strings"
	"testing"
	"time"
)

func TestFriendFailureDoesNotBlockOtherQueuedFriends(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db, CheckHomepage: func(_ context.Context, address string) error {
		if strings.Contains(address, "bad.example") {
			return errors.New("offline")
		}
		return nil
	}, StoreAvatar: func(context.Context, string) (string, error) { return "/static/checked.png", nil }, CheckBacklink: func(context.Context, community.Friend) (community.BacklinkResult, error) {
		return community.BacklinkResult{Found: true}, nil
	}}
	ids := map[string]string{}
	for _, name := range []string{"bad", "good"} {
		f, _, err := store.CreateFriend(ctx, community.Friend{Name: name, URL: "https://" + name + ".example", BacklinkURL: "https://" + name + ".example/friends", Avatar: "https://" + name + ".example/avatar.png", Description: "fixture", Email: "fixture@example.test"}, true)
		if err != nil {
			t.Fatal(err)
		}
		ids[name] = f.ID
	}
	for i := 0; i < 2; i++ {
		job, err := store.ClaimFriendJob(ctx, time.Now())
		if err != nil || job == nil {
			t.Fatal("another friend blocked", err)
		}
		workErr := store.ProcessClaimedFriendJob(ctx, *job)
		if err = store.FinishFriendJob(ctx, *job, workErr); err != nil {
			t.Fatal(err)
		}
	}
	var status string
	var failures int
	db.QueryRow("SELECT status,processing_failures FROM friends WHERE id=?", ids["bad"]).Scan(&status, &failures)
	if status != "待审核" || failures != 1 {
		t.Fatal(status, failures)
	}
	db.QueryRow("SELECT status,processing_failures FROM friends WHERE id=?", ids["good"]).Scan(&status, &failures)
	if status != "展示中" || failures != 0 {
		t.Fatal("healthy friend affected", status, failures)
	}
}
func TestAbandonMailFailureRollsBackDeletion(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "abandon", URL: "https://abandon.example", BacklinkURL: "https://abandon.example/friends", Email: "fixture@example.test", Status: "待审核"}, false)
	if err != nil {
		t.Fatal(err)
	}
	db.Exec("UPDATE friends SET processing_failures=5 WHERE id=?", f.ID)
	db.Exec("DROP TABLE friend_mail_outbox")
	if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{}, "abandon", 0); err == nil {
		t.Fatal("discarded without durable failure mail")
	}
	var n int
	db.QueryRow("SELECT count(*) FROM friends WHERE id=?", f.ID).Scan(&n)
	if n != 1 {
		t.Fatal("deletion was not rolled back")
	}
}
