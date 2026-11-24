package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/settings"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
	"strings"
	"testing"
	"time"
)

func TestTaskSettingsPersistAndRemainPrivate(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := settings.Store{DB: db}
	// Preserve the previously configured video period before a new task setting exists.
	if _, err := db.Exec("INSERT INTO video_meta(`key`,value) VALUES('sync_interval_ms','7200000')"); err != nil {
		t.Fatal(err)
	}
	initial, err := store.Read(ctx, false)
	if err != nil || initial[taskconfig.Key("video-sync")] != float64(7200) {
		t.Fatal(initial[taskconfig.Key("video-sync")], err)
	}
	for k, v := range map[string]any{taskconfig.Key("video-sync"): float64(10800), "tasks.friendsTime": "07:30", "tasks.friendsEveryDays": float64(2)} {
		if _, err := store.Save(ctx, k, v); err != nil {
			t.Fatal(k, err)
		}
	}
	restarted, err := (settings.Store{DB: db}).Read(ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	config := taskconfig.New(restarted)
	ctx = taskconfig.With(ctx, config)
	if taskconfig.Duration(ctx, "video-sync") != 3*time.Hour || config.Clock() != "07:30" || config.FriendDays() != 2 {
		t.Fatal("saved schedule lost after restart")
	}
	if config.Plan("video-sync").Expression != "0 */3 * * *" {
		t.Fatal("legacy interval wasn't carried into Cron")
	}
	key := taskconfig.CronKey("video-sync")
	if _, err := store.Save(ctx, key, "0 90 * * *"); err == nil {
		t.Fatal("invalid Cron accepted")
	}
	if _, err := store.Save(ctx, key, " 15  9 * * MON-FRI "); err != nil {
		t.Fatal(err)
	}
	updated, err := store.Read(ctx, false)
	if err != nil || updated[key] != "15 9 * * MON-FRI" {
		t.Fatal(updated[key], err)
	}
	config.Reload(updated)
	tracker := taskruns.New(db)
	tracker.Config = config
	list, err := tracker.List(ctx)
	if err != nil || list["load"] == nil {
		t.Fatal("task load not available", err)
	}
	for _, item := range list["tasks"].([]taskruns.Instance) {
		if item.Kind == "periodic" && (item.Cron == "" || len(item.NextRuns) != 5) {
			t.Fatalf("missing Cron preview for %s", item.Key)
		}
	}
	public, err := store.Read(ctx, true)
	if err != nil {
		t.Fatal(err)
	}
	for k := range public {
		if strings.HasPrefix(k, "tasks.") {
			t.Fatal("public task setting", k)
		}
	}
	friends := community.Store{DB: db}
	friend, _, err := friends.CreateFriend(ctx, community.Friend{Email: "fixture@example.test", Name: "schedule", URL: "https://example.com", BacklinkURL: "https://example.com/friends", Status: "待审核"}, false)
	if err != nil {
		t.Fatal(err)
	}
	job, err := friends.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil || job.FriendID != friend.ID {
		t.Fatal(job, err)
	}
	job.Attempts = 1000
	if err = friends.FinishFriendJob(ctx, *job, errors.New("fixture")); err != nil {
		t.Fatal(err)
	}
	due, err := friends.NextFriendJob(ctx)
	if err != nil || !due.IsZero() {
		t.Fatal("failed work was rescheduled", due, err)
	}
}
