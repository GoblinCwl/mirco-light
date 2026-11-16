package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/friendmail"
	"goblincwl/quartz-server/internal/settings"
	"testing"
	"time"
)

func TestFriendReviewMailAndPeriodicFailures(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db, CheckBacklink: func(context.Context, community.Friend) (community.BacklinkResult, error) {
		return community.BacklinkResult{Found: true}, nil
	}}
	newFriend := func(name string) community.Friend {
		t.Helper()
		f, _, err := store.CreateFriend(ctx, community.Friend{Name: name, Email: "fixture@example.test", URL: "https://" + name + ".example", BacklinkURL: "https://" + name + ".example/friends", Avatar: "https://" + name + ".example/avatar.png", Description: "fixture"}, true)
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	count := func() int { var n int; db.QueryRow("SELECT count(*) FROM friend_mail_outbox").Scan(&n); return n }
	approved := newFriend("pass")
	db.Exec("UPDATE friends SET review_ready=1 WHERE id=?", approved.ID)
	for i := 0; i < 2; i++ {
		if _, err := store.AutoReviewFriend(ctx, approved.ID); err != nil {
			t.Fatal(err)
		}
	}
	if count() != 1 {
		t.Fatal("duplicate approval mail", count())
	}
	public, err := store.Friends(ctx, true)
	if err != nil || len(public) != 1 || public[0].Email != "" {
		t.Fatal("public email leak", err)
	}
	for i := 0; i < 2; i++ {
		if _, err := store.UpdateFriend(ctx, approved.ID, community.Friend{Status: "已失效"}, "review", 0); err != nil {
			t.Fatal(err)
		}
	}
	if count() != 1 {
		t.Fatal("rejection sent mail without confirmation")
	}
	for i := 0; i < 2; i++ {
		if _, err := store.UpdateFriend(ctx, approved.ID, community.Friend{}, "failure-mail", 0); err != nil {
			t.Fatal(err)
		}
	}
	if count() != 2 {
		t.Fatal("explicit failure mail duplicated")
	}
	cfg := settings.Store{DB: db}
	if _, err = cfg.Save(ctx, "notify.astrbot.enabled", true); err != nil {
		t.Fatal(err)
	}
	if _, err = cfg.Save(ctx, "friends.failureLimit", float64(3)); err != nil {
		t.Fatal(err)
	}
	pending := newFriend("pending")
	if _, err := store.UpdateFriend(ctx, pending.ID, community.Friend{}, "abandon", 0); err == nil {
		t.Fatal("abandoned below threshold")
	}

	db.Exec("DELETE FROM friend_jobs WHERE friend_id<>?", pending.ID)
	for i := 0; i < 5; i++ {
		if i > 0 {
			if err := store.EnqueueFriend(ctx, pending.ID); err != nil {
				t.Fatal(err)
			}
		}
		job, err := store.ClaimFriendJob(ctx, time.Now().Add(24*time.Hour))
		if err != nil || job == nil {
			t.Fatal("missing attempt", i, err)
		}
		if err = store.FinishFriendJob(ctx, *job, errors.New("fixture failure")); err != nil {
			t.Fatal(err)
		}
	}
	var status string
	var failures int
	db.QueryRow("SELECT status,processing_failures FROM friends WHERE id=?", pending.ID).Scan(&status, &failures)
	if status != "待审核" || failures != 5 || count() != 2 {
		t.Fatal("failure altered record or mailed", status, failures, count())
	}
	var notifications int
	db.QueryRow("SELECT count(*) FROM notification_outbox WHERE kind='friends'").Scan(&notifications)
	if notifications != 3 {
		t.Fatal("missing per-failure threshold notifications", notifications)
	}
	if err = store.RecoverFriendJobs(ctx); err != nil {
		t.Fatal(err)
	}
	var n int
	db.QueryRow("SELECT count(*) FROM friend_jobs WHERE friend_id=?", pending.ID).Scan(&n)
	if n != 0 {
		t.Fatal("exhausted job recovered")
	}
	if _, err = store.UpdateFriend(ctx, pending.ID, community.Friend{}, "abandon", 0); err != nil {
		t.Fatal(err)
	}
	db.QueryRow("SELECT count(*) FROM friends WHERE id=?", pending.ID).Scan(&n)
	if n != 0 || count() != 3 {
		t.Fatal("abandon did not mail and delete", n, count())
	}
	mails := friendmail.Store{DB: db, Send: func(context.Context, friendmail.Message) error { return errors.New("mock SMTP failure") }}
	if ok, err := mails.Deliver(ctx); !ok || err != nil {
		t.Fatal(err)
	}
	db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE attempts=1 AND state='pending'").Scan(&n)
	if n != 1 {
		t.Fatal("mail not retried")
	}
	db.Exec("UPDATE friend_mail_outbox SET available_at=0")
	mails.Send = func(context.Context, friendmail.Message) error { return nil }
	for i := 0; i < 3; i++ {
		if _, err := mails.Deliver(ctx); err != nil {
			t.Fatal(err)
		}
	}
	db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE state='sent'").Scan(&n)
	if n != 3 {
		t.Fatal("mail not delivered", n)
	}
	legacy := newFriend("legacy")
	db.Exec("UPDATE friends SET email='',processing_failures=3 WHERE id=?", legacy.ID)
	if _, err = store.UpdateFriend(ctx, legacy.ID, community.Friend{}, "abandon", 0); err == nil {
		t.Fatal("discarded without notification address")
	}

}
