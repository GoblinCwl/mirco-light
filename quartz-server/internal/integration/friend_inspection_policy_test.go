package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"testing"
	"time"
)

func TestInspectionFailuresCountAllStagesAndRemoveAtSeven(t *testing.T) {
	for _, stage := range []string{"homepage", "avatar", "rss"} {
		t.Run(stage, func(t *testing.T) {
			db := testDB(t)
			ctx := context.Background()
			avatars, feeds := 0, 0
			store := community.Store{DB: db, CheckHomepage: func(context.Context, string) error {
				if stage == "homepage" {
					return errors.New("offline")
				}
				return nil
			}, StoreAvatar: func(context.Context, string) (string, error) {
				avatars++
				if stage == "avatar" {
					return "", errors.New("compression failure")
				}
				return "/static/checked.png", nil
			}, ReadFeed: func(context.Context, string) (time.Time, error) {
				feeds++
				return time.Time{}, errors.New("RSS failure")
			}}
			f, _, err := store.CreateFriend(ctx, community.Friend{Name: stage, Email: "fixture@example.test", URL: "https://" + stage + ".example", BacklinkURL: "https://" + stage + ".example/friends", Avatar: "https://" + stage + ".example/avatar.png", RSSURL: "https://" + stage + ".example/feed", Status: "展示中"}, false)
			if err != nil {
				t.Fatal(err)
			}
			for attempt := 1; attempt <= 7; attempt++ {
				if attempt > 1 {
					db.Exec("UPDATE friends SET inspection_failed_on='2000-01-01' WHERE id=?", f.ID)
					if err = store.EnqueueFriend(ctx, f.ID); err != nil {
						t.Fatal(err)
					}
				}
				job, err := store.ClaimFriendJob(ctx, time.Now())
				if err != nil || job == nil || !job.InspectOnly {
					t.Fatal(job, err)
				}
				failure := store.ProcessClaimedFriendJob(ctx, *job)
				if failure == nil {
					t.Fatal("inspection failure ignored")
				}
				if err = store.FinishFriendJob(ctx, *job, failure); err != nil {
					t.Fatal(err)
				}
				var count, n int
				db.QueryRow("SELECT count(*) FROM friends WHERE id=?", f.ID).Scan(&n)
				if attempt < 7 {
					db.QueryRow("SELECT inspection_failures FROM friends WHERE id=?", f.ID).Scan(&count)
					if n != 1 || count != attempt {
						t.Fatal("unexpected failure counter/removal", attempt, n, count)
					}
					public, err := store.Friends(ctx, true)
					if err != nil || len(public) != 1 || public[0].InspectionFailures != attempt {
						t.Fatal("public inspection counter missing", err)
					}
				} else if n != 0 {
					t.Fatal("not removed at seven")
				}
			}
			if stage == "homepage" && (avatars != 0 || feeds != 0) {
				t.Fatal("homepage failure did not skip remaining stages")
			}
			if stage == "avatar" && feeds != 0 {
				t.Fatal("avatar failure did not skip RSS")
			}
			var n int
			db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE friend_id=? AND kind='friends-removed'", f.ID).Scan(&n)
			if n != 1 {
				t.Fatal("removal email missing or duplicated", n)
			}
			db.QueryRow("SELECT count(*) FROM friend_jobs WHERE friend_id=?", f.ID).Scan(&n)
			if n != 0 {
				t.Fatal("removed friend left queued work")
			}
		})
	}
}
func TestInspectionRemovalWithoutEmailRecordsAlert(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "legacy", URL: "https://legacy.example", BacklinkURL: "https://legacy.example/friends", Status: "展示中"}, false)
	if err != nil {
		t.Fatal(err)
	}
	db.Exec("UPDATE friends SET inspection_failures=6 WHERE id=?", f.ID)
	job, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil {
		t.Fatal(err)
	}
	if err = store.FinishFriendJob(ctx, *job, errors.New("offline")); err != nil {
		t.Fatal(err)
	}
	var n int
	db.QueryRow("SELECT count(*) FROM friends WHERE id=?", f.ID).Scan(&n)
	if n != 0 {
		t.Fatal("legacy friend was not removed")
	}
	db.QueryRow("SELECT count(*) FROM alerts WHERE title='友链已移除，无法发送邮件'").Scan(&n)
	if n != 1 {
		t.Fatal("missing no-email alert")
	}
	db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE friend_id=?", f.ID).Scan(&n)
	if n != 0 {
		t.Fatal("mail queued without address")
	}
}

func TestInspectionDaysDeduplicateAndUseConfiguredThresholds(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "days", URL: "https://days.example", BacklinkURL: "https://days.example/friends", Status: "展示中"}, false)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if i > 0 {
			if err = store.EnqueueFriend(ctx, f.ID); err != nil {
				t.Fatal(err)
			}
		}
		job, e := store.ClaimFriendJob(ctx, time.Now())
		if e != nil || job == nil {
			t.Fatal(e)
		}
		if e = store.FinishFriendJob(ctx, *job, errors.New("fixture failure")); e != nil {
			t.Fatal(e)
		}
	}
	var count int
	if err = db.QueryRow("SELECT inspection_failures FROM friends WHERE id=?", f.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("same day counted twice", count, err)
	}
	if _, err = db.Exec("INSERT INTO settings (`key`,value) VALUES ('tasks.friendsGrayDays','1'),('tasks.friendsRemoveDays','2') ON DUPLICATE KEY UPDATE value=VALUES(value)"); err != nil {
		t.Fatal(err)
	}
	friends, err := store.Friends(ctx, true)
	if err != nil || len(friends) != 1 || friends[0].InspectionGrayDays != 1 {
		t.Fatal("gray threshold missing", err)
	}
	db.Exec("UPDATE friends SET inspection_failed_on='2000-01-01' WHERE id=?", f.ID)
	if err = store.EnqueueFriend(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	job, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil {
		t.Fatal(err)
	}
	if err = store.FinishFriendJob(ctx, *job, errors.New("fixture failure")); err != nil {
		t.Fatal(err)
	}
	db.QueryRow("SELECT count(*) FROM friends WHERE id=?", f.ID).Scan(&count)
	if count != 0 {
		t.Fatal("configured removal threshold ignored")
	}
}
