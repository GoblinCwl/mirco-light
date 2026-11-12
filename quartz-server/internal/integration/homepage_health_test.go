package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"testing"
	"time"
)

func TestHomepageRetriesOncePerDayRecoversAndExpires(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	create := func(name string) community.Friend {
		f, _, err := store.CreateFriend(ctx, community.Friend{Name: name, URL: "https://" + name + ".example/", BacklinkURL: "https://" + name + ".example/friends", RSSURL: "https://" + name + ".example/feed", Status: "展示中", HealthFailures: 7}, false)
		if err != nil {
			t.Fatal(err)
		}
		if f.HealthFailures != 0 {
			t.Fatal("client supplied health metadata")
		}
		return f
	}
	bad := create("bad")
	recovering := create("recover")
	good := create("good")
	if _, err := db.Exec("UPDATE friends SET latest_update='2026-11-12T00:00:00.000Z'"); err != nil {
		t.Fatal(err)
	}
	checks := map[string]int{}
	feeds := map[string]int{}
	recovered := false
	store.CheckHomepage = func(_ context.Context, address string) error {
		checks[address]++
		if address == bad.URL || address == recovering.URL && !recovered {
			return errors.New("HTTP 503")
		}
		return nil
	}
	store.ReadFeed = func(_ context.Context, address string) (time.Time, error) {
		feeds[address]++
		return time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC), nil
	}
	_, err := store.RefreshLinks(ctx)
	if err == nil {
		t.Fatal("missing homepage errors")
	}
	read := func(id string) community.Friend {
		friends, err := store.Friends(ctx, false)
		if err != nil {
			t.Fatal(err)
		}
		for _, f := range friends {
			if f.ID == id {
				return f
			}
		}
		t.Fatal("friend missing")
		return community.Friend{}
	}
	failed := read(bad.ID)
	if failed.HealthFailures != 1 || failed.LatestUpdate != "" || failed.Status != "展示中" || failed.HealthError == "" {
		t.Fatal(failed)
	}
	if feeds[bad.RSSURL] != 0 || feeds[recovering.RSSURL] != 0 {
		t.Fatal("failed homepage refreshed RSS", feeds)
	}
	store.RefreshLinks(ctx)
	if read(bad.ID).HealthFailures != 1 || checks[bad.URL] != 1 || checks[good.URL] != 1 {
		t.Fatal("same day consumed another retry", checks)
	}
	recovered = true
	if _, err := db.Exec("UPDATE friends SET health_checked_on='' WHERE id=?", recovering.ID); err != nil {
		t.Fatal(err)
	}
	store.RefreshLinks(ctx)
	restored := read(recovering.ID)
	if restored.HealthFailures != 0 || restored.HealthError != "" || restored.LatestUpdate != "2026-11-13T00:00:00.000Z" {
		t.Fatal("site did not recover", restored)
	}
	for attempt := 2; attempt <= 7; attempt++ {
		// Simulate each next daily task by expiring this fixture's persisted check date.
		if _, err := db.Exec("UPDATE friends SET health_checked_on='' WHERE id=?", bad.ID); err != nil {
			t.Fatal(err)
		}
		store.RefreshLinks(ctx)
		if f := read(bad.ID); f.HealthFailures != attempt {
			t.Fatal("incorrect daily retry count", f, attempt)
		}
	}
	expired := read(bad.ID)
	if expired.Status != "已失效" || expired.LatestUpdate != "" {
		t.Fatal("retry limit not enforced", expired)
	}
	count := checks[bad.URL]
	store.RefreshLinks(ctx)
	if checks[bad.URL] != count {
		t.Fatal("expired queue entry still probed")
	}
	public, err := store.Friends(ctx, true)
	if err != nil || len(public) != 2 {
		t.Fatal("expired site still displayed", public, err)
	}
	expired.Status = "展示中"
	if _, err := store.UpdateFriend(ctx, expired.ID, expired, "update", 0); err != nil {
		t.Fatal(err)
	}
	if f := read(bad.ID); f.HealthFailures != 0 || f.HealthCheckedOn != "" {
		t.Fatal("manual restoration did not reset queue", f)
	}
}
func TestHealthFailurePreventsRSSInitializationRestoringTimestamp(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "race", URL: "https://race.example/", BacklinkURL: "https://race.example/friends", RSSURL: "https://race.example/feed"}, false)
	if err != nil {
		t.Fatal(err)
	}
	store.ReadFeed = func(context.Context, string) (time.Time, error) {
		if _, err := db.Exec("UPDATE friends SET health_failures=1,latest_update='' WHERE id=?", f.ID); err != nil {
			t.Fatal(err)
		}
		return time.Now(), nil
	}
	if err := store.InitializeFeed(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	var latest string
	if err := db.QueryRow("SELECT latest_update FROM friends WHERE id=?", f.ID).Scan(&latest); err != nil || latest != "" {
		t.Fatal("RSS initialized an unavailable site's timestamp", latest, err)
	}
}
