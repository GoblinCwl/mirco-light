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

func TestFriendJobQueueVersionsBackoffAndRestartRecovery(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	friend, _, err := store.CreateFriend(ctx, community.Friend{Name: "queue", URL: "https://queue.example/", BacklinkURL: "https://queue.example/friends", Status: "待审核"}, false)
	if err != nil {
		t.Fatal(err)
	}
	job, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil || job.Generation != 1 {
		t.Fatal(job, err)
	}
	if err := store.EnqueueFriend(ctx, friend.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.FinishFriendJob(ctx, *job, nil); err != nil {
		t.Fatal(err)
	}
	next, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || next == nil || next.Generation != 2 {
		t.Fatal("old completion lost resubmission", next, err)
	}
	if err := store.FinishFriendJob(ctx, *next, errors.New("fixture network outage")); err != nil {
		t.Fatal(err)
	}
	if due, err := store.NextFriendJob(ctx); err != nil || !due.After(time.Now()) {
		t.Fatal("failure did not schedule a delayed retry", due, err)
	}
	if job, err := store.ClaimFriendJob(ctx, time.Now()); err != nil || job != nil {
		t.Fatal("retry ran before due time", job, err)
	}
	if err := store.RecoverFriendJobs(ctx); err != nil {
		t.Fatal(err)
	}
	restarted, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || restarted == nil || restarted.Attempts != 1 {
		t.Fatal("restart lost pending retry", restarted, err)
	}
	// Simulate service death while the claimed job is still running.
	if err := store.RecoverFriendJobs(ctx); err != nil {
		t.Fatal(err)
	}
	recovered, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || recovered == nil || recovered.Generation != 2 {
		t.Fatal("running task not recovered", recovered, err)
	}
	if err := store.FinishFriendJob(ctx, *recovered, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := store.UpdateFriend(ctx, friend.ID, community.Friend{}, "delete", 0); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM friend_jobs").Scan(&count); err != nil || count != 0 {
		t.Fatal("deleted friend left work items", count, err)
	}
}
func TestFriendJobPerformsDeferredWorkAndRetainsFailures(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	calls := 0
	down := true
	store.StoreAvatar = func(context.Context, string) (string, error) {
		calls++
		if down {
			return "", errors.New("storage offline")
		}
		return "/api/site/friends/avatar/" + strings.Repeat("a", 64) + ".png", nil
	}
	store.ReadFeed = func(context.Context, string) (time.Time, error) {
		calls++
		return time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC), nil
	}
	store.CheckBacklink = func(context.Context, community.Friend) (community.BacklinkResult, error) {
		calls++
		if down {
			return community.BacklinkResult{}, errors.New("page offline")
		}
		return community.BacklinkResult{Found: true, Message: "passed"}, nil
	}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "background", URL: "https://job.example/", BacklinkURL: "https://job.example/friends", Avatar: "https://job.example/avatar.png", RSSURL: "https://job.example/feed", Description: "hello"}, true)
	if err != nil || calls != 0 {
		t.Fatal("submit did remote work", calls, err)
	}
	job, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil {
		t.Fatal(job, err)
	}
	failure := store.ProcessFriendJob(ctx, f.ID)
	if failure == nil {
		t.Fatal("background errors lost")
	}
	if err := store.FinishFriendJob(ctx, *job, failure); err != nil {
		t.Fatal(err)
	}
	if err := store.RecoverFriendJobs(ctx); err != nil {
		t.Fatal(err)
	}
	down = false
	job, err = store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil {
		t.Fatal(job, err)
	}
	if err := store.ProcessFriendJob(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.FinishFriendJob(ctx, *job, nil); err != nil {
		t.Fatal(err)
	}
	friends, err := store.Friends(ctx, true)
	if err != nil || len(friends) != 1 || friends[0].LatestUpdate == "" || !strings.HasPrefix(friends[0].Avatar, "/api/site/friends/avatar/") {
		t.Fatal("deferred work incomplete", friends, err)
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM friend_jobs").Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
}

func TestQueueInsertFailureRollsBackNewFriend(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	if _, err := db.Exec("DROP TABLE friend_jobs"); err != nil {
		t.Fatal(err)
	}
	_, _, err := (community.Store{DB: db}).CreateFriend(ctx, community.Friend{Name: "atomic", URL: "https://atomic.example/", BacklinkURL: "https://atomic.example/friends"}, false)
	if err == nil {
		t.Fatal("submission succeeded without a durable job")
	}
	var count int
	if err := db.QueryRow("SELECT count(*) FROM friends").Scan(&count); err != nil || count != 0 {
		t.Fatal("friend was committed without its task", count, err)
	}
}
func TestGenericFriendMaintenanceAlsoQueuesRemoteWork(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	manager := datamanager.Manager{DB: db}
	value, err := manager.Save(ctx, "friends", map[string]any{"name": "generic", "url": "https://generic.example/", "backlink_url": "https://generic.example/friends", "avatar": "https://generic.example/avatar.png", "rss_url": "https://generic.example/feed", "description": "hello"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	id := value["key"].(map[string]any)["id"].(string)
	job, err := (community.Store{DB: db}).ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil || job.FriendID != id {
		t.Fatal("generic save did not enqueue", job, err)
	}
	var avatar, source, latest, review string
	if err := db.QueryRow("SELECT avatar,avatar_source,latest_update,review_result FROM friends WHERE id=?", id).Scan(&avatar, &source, &latest, &review); err != nil || avatar != "https://generic.example/avatar.png" || source != avatar || latest != "" || review != "" {
		t.Fatal("generic save performed remote work", avatar, source, latest, review, err)
	}
	if _, err = manager.Save(ctx, "friends", map[string]any{"description": "edited"}, map[string]any{"id": id}); err != nil {
		t.Fatal(err)
	}
	if err := (community.Store{DB: db}).FinishFriendJob(ctx, *job, nil); err != nil {
		t.Fatal(err)
	}
	next, err := (community.Store{DB: db}).ClaimFriendJob(ctx, time.Now())
	if err != nil || next == nil || next.Generation <= job.Generation {
		t.Fatal("generic edit lost new work version", next, err)
	}
}

func TestManualApprovalRunsInspectionOnceAndRemovesFailedQueueItem(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "manual", Description: "fixture", URL: "https://manual.example/", BacklinkURL: "https://manual.example/friends", Avatar: "https://manual.example/avatar.png", RSSURL: "https://manual.example/feed"}, true)
	if err != nil {
		t.Fatal(err)
	}
	old, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || old == nil {
		t.Fatal(old, err)
	}
	if err = store.FinishFriendJob(ctx, *old, errors.New("old failed review task")); err != nil {
		t.Fatal(err)
	}
	homepage, avatar, feed, review := 0, 0, 0, 0
	store.CheckHomepage = func(context.Context, string) error { homepage++; return nil }
	store.StoreAvatar = func(context.Context, string) (string, error) {
		avatar++
		return "", errors.New("invalid avatar content")
	}
	expected := time.Date(2026, 11, 14, 3, 0, 0, 0, time.UTC)
	store.ReadFeed = func(context.Context, string) (time.Time, error) { feed++; return expected, nil }
	store.CheckBacklink = func(context.Context, community.Friend) (community.BacklinkResult, error) {
		review++
		return community.BacklinkResult{}, errors.New("must not review")
	}
	if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{Status: "展示中"}, "review", 0); err != nil {
		t.Fatal(err)
	}
	if homepage+avatar+feed+review != 0 {
		t.Fatal("manual approval blocked on remote inspection")
	}
	// RSS must be refreshed, not just initialized when it is missing.
	if _, err = db.Exec("UPDATE friends SET latest_update='2020-01-01T00:00:00.000Z' WHERE id=?", f.ID); err != nil {
		t.Fatal(err)
	}
	job, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil || !job.InspectOnly || job.Attempts != 0 || job.Generation <= old.Generation {
		t.Fatal("manual approval did not replace failed work", job, err)
	}
	// A service restart retains this explicit one-off task until it is performed.
	if err = store.RecoverFriendJobs(ctx); err != nil {
		t.Fatal(err)
	}
	job, err = store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil || !job.InspectOnly {
		t.Fatal("lost manual inspection on recovery", job, err)
	}
	workErr := store.ProcessClaimedFriendJob(ctx, *job)
	if workErr == nil || homepage != 1 || avatar != 1 || feed != 1 || review != 0 {
		t.Fatal("inspection steps incorrect", homepage, avatar, feed, review, workErr)
	}
	if err = store.FinishFriendJob(ctx, *job, workErr); err != nil {
		t.Fatal(err)
	}
	var status, result, latest string
	if err = db.QueryRow("SELECT status,review_result,latest_update FROM friends WHERE id=?", f.ID).Scan(&status, &result, &latest); err != nil {
		t.Fatal(err)
	}
	if status != "展示中" || result != "人工审核：展示中" || latest != expected.Format("2006-01-02T15:04:05.000Z") {
		t.Fatal(status, result, latest)
	}
	var count int
	if err = store.RecoverFriendJobs(ctx); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT count(*) FROM friend_jobs WHERE friend_id=?", f.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("manual friend was repeatedly recovered into review queue", count, err)
	}
	// Subsequent regular inspection still retries a failed avatar independently.
	store.StoreAvatar = func(context.Context, string) (string, error) {
		avatar++
		return "/api/site/friends/avatar/" + strings.Repeat("b", 64) + ".webp", nil
	}
	if _, err = store.RefreshLinks(ctx); err != nil {
		t.Fatal("daily inspection failed", err)
	}
	if avatar != 2 || review != 0 {
		t.Fatal("daily retry did not stay independent of review", avatar, review)
	}
}

func TestManualInspectionFailureUsesDailyHomepageHealthAndCannotDeleteNewerWork(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "manual-health", Description: "fixture", Avatar: "https://health.example/avatar.png", URL: "https://health.example/", BacklinkURL: "https://health.example/friends", RSSURL: "https://health.example/feed"}, true)
	if err != nil {
		t.Fatal(err)
	}
	old, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || old == nil {
		t.Fatal(old, err)
	}
	if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{Status: "展示中"}, "review", 0); err != nil {
		t.Fatal(err)
	}
	if err = store.FinishFriendJob(ctx, *old, errors.New("stale automatic task")); err != nil {
		t.Fatal(err)
	}
	job, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || job == nil || !job.InspectOnly {
		t.Fatal(job, err)
	}
	checks := 0
	store.CheckHomepage = func(context.Context, string) error { checks++; return errors.New("homepage offline") }
	store.CheckBacklink = func(context.Context, community.Friend) (community.BacklinkResult, error) {
		t.Fatal("manual approval triggered auto review")
		return community.BacklinkResult{}, nil
	}
	store.ReadFeed = func(context.Context, string) (time.Time, error) {
		t.Fatal("unhealthy site fetched RSS")
		return time.Time{}, nil
	}
	failure := store.ProcessClaimedFriendJob(ctx, *job)
	if failure == nil || checks != 1 {
		t.Fatal(checks, failure)
	}
	var health int
	var status string
	if err = db.QueryRow("SELECT status,health_failures FROM friends WHERE id=?", f.ID).Scan(&status, &health); err != nil || health != 1 || status != "展示中" {
		t.Fatal(status, health, err)
	}
	// Administrator changes their decision while the one-off task is in flight.
	if _, err = store.UpdateFriend(ctx, f.ID, community.Friend{Status: "待审核"}, "review", 0); err != nil {
		t.Fatal(err)
	}
	if err = store.FinishFriendJob(ctx, *job, failure); err != nil {
		t.Fatal(err)
	}
	next, err := store.ClaimFriendJob(ctx, time.Now())
	if err != nil || next == nil || next.InspectOnly || next.Generation <= job.Generation {
		t.Fatal("old inspection removed newer automatic work", next, err)
	}
	if err = store.ProcessClaimedFriendJob(ctx, *job); err != nil {
		t.Fatal("stale inspection should skip a newly pending friend", err)
	}
}
