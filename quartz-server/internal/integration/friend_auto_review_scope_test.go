package integration

import (
	"context"
	"goblincwl/quartz-server/internal/community"
	"testing"
)

func TestAutoReviewQueuesOnlyPendingAndCoalescesRequests(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	ids := map[string]string{}
	for _, status := range []string{"待审核", "展示中", "已失效"} {
		name := map[string]string{"待审核": "pending", "展示中": "approved", "已失效": "rejected"}[status]
		f, _, err := store.CreateFriend(ctx, community.Friend{Name: name, URL: "https://" + name + ".example", BacklinkURL: "https://" + name + ".example/friends", Status: status}, false)
		if err != nil {
			t.Fatal(err)
		}
		ids[status] = f.ID
	}
	db.Exec("DELETE FROM friend_jobs")
	n, err := store.EnqueuePendingFriendReviews(ctx)
	if err != nil || n != 1 {
		t.Fatal(n, err)
	}
	n, err = store.EnqueuePendingFriendReviews(ctx)
	if err != nil || n != 0 {
		t.Fatal("duplicate automatic review", n, err)
	}
	if err = store.EnqueueFriendReview(ctx, ids["展示中"]); err == nil {
		t.Fatal("requeued approved friend")
	}
	if err = store.EnqueueFriendReview(ctx, ids["已失效"]); err == nil {
		t.Fatal("requeued rejected friend")
	}
	if err = store.EnqueueFriendReview(ctx, ids["待审核"]); err != nil {
		t.Fatal(err)
	}
	var count, generation int
	db.QueryRow("SELECT count(*) FROM friend_jobs").Scan(&count)
	db.QueryRow("SELECT generation FROM friend_jobs WHERE friend_id=?", ids["待审核"]).Scan(&generation)
	if count != 1 || generation != 1 {
		t.Fatal("request replay changed other friends or job version", count, generation)
	}
}
