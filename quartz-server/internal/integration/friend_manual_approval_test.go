package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"testing"
	"time"
)

func TestFriendManualApprovalQueueSkipsBacklinkAndRequiresChecks(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "failure"}[fail], func(t *testing.T) {
			db := testDB(t)
			ctx := context.Background()
			backlinks := 0
			store := community.Store{DB: db, CheckHomepage: func(context.Context, string) error { return nil }, StoreAvatar: func(context.Context, string) (string, error) {
				if fail {
					return "", errors.New("avatar failed")
				}
				return "/static/avatar.png", nil
			}, ReadFeed: func(context.Context, string) (time.Time, error) { return time.Now(), nil }, CheckBacklink: func(context.Context, community.Friend) (community.BacklinkResult, error) {
				backlinks++
				return community.BacklinkResult{}, errors.New("must not run")
			}}
			f, _, err := store.CreateFriend(ctx, community.Friend{Name: "manual", Email: "fixture@example.test", URL: "https://manual.example", BacklinkURL: "https://manual.example/friends", Avatar: "https://manual.example/avatar", RSSURL: "https://manual.example/feed", Status: "待审核"}, false)
			if err != nil {
				t.Fatal(err)
			}
			if err = store.EnqueueManualFriendApproval(ctx, f.ID); err != nil {
				t.Fatal(err)
			}
			if err = store.EnqueueManualFriendApproval(ctx, f.ID); err != nil {
				t.Fatal(err)
			}
			job, err := store.ClaimFriendJob(ctx, time.Now())
			if err != nil || job == nil || !job.ManualApproval {
				t.Fatal(job, err)
			}
			workErr := store.ProcessClaimedFriendJob(ctx, *job)
			if (workErr != nil) != fail || backlinks != 0 {
				t.Fatal("incorrect check/backlink behavior", workErr, backlinks)
			}
			if err = store.FinishFriendJob(ctx, *job, workErr); err != nil {
				t.Fatal(err)
			}
			var status string
			var verified bool
			db.QueryRow("SELECT status,verified FROM friends WHERE id=?", f.ID).Scan(&status, &verified)
			want := "展示中"
			if fail {
				want = "待审核"
			}
			if status != want || verified {
				t.Fatal(status, verified)
			}
			var queued int
			db.QueryRow("SELECT count(*) FROM friend_jobs WHERE friend_id=?", f.ID).Scan(&queued)
			if queued != 0 {
				t.Fatal("extra inspection queued")
			}
		})
	}
}
