package integration

import (
	"context"
	"goblincwl/quartz-server/internal/community"
	"testing"
)

func TestFriendVerificationDefaultsAndToggle(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db, CheckBacklink: func(context.Context, community.Friend) (community.BacklinkResult, error) {
		return community.BacklinkResult{Found: true}, nil
	}}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "verified", URL: "https://verified.example", BacklinkURL: "https://verified.example/friends", Status: "待审核"}, false)
	if err != nil {
		t.Fatal(err)
	}
	db.Exec("UPDATE friends SET review_ready=1 WHERE id=?", f.ID)
	f, err = store.AutoReviewFriend(ctx, f.ID)
	if err != nil || !f.Verified {
		t.Fatal("automatic approval not verified", f, err)
	}
	for _, want := range []bool{false, true} {
		list, e := store.UpdateFriend(ctx, f.ID, community.Friend{}, "verification", 0)
		if e != nil || len(list) != 1 || list[0].Verified != want {
			t.Fatal("toggle failed", list, e)
		}
	}
	f.Status = "待审核"
	if _, err = store.UpdateFriend(ctx, f.ID, f, "update", 0); err != nil {
		t.Fatal(err)
	}
	db.Exec("UPDATE friends SET review_ready=1 WHERE id=?", f.ID)
	list, err := store.UpdateFriend(ctx, f.ID, community.Friend{Status: "展示中"}, "review", 0)
	if err != nil || list[0].Verified {
		t.Fatal("manual approval unexpectedly verified", list, err)
	}
	if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{Status: "待审核"}, "review", 0); err != nil {
		t.Fatal(err)
	}
	var queued int
	if err = db.QueryRow("SELECT count(*) FROM friend_jobs WHERE friend_id=?", f.ID).Scan(&queued); err != nil || queued != 0 {
		t.Fatal("manual pending status left automatic work queued", queued, err)
	}

}
