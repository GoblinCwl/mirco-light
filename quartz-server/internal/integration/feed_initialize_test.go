package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"testing"
	"time"
)

func TestInitialFeedFetchPopulatesDateWithoutLosingSavedFriend(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	f, _, err := store.CreateFriend(ctx, community.Friend{Name: "new", URL: "https://new.example/", BacklinkURL: "https://new.example/friends", RSSURL: "https://new.example/feed.xml"}, false)
	if err != nil {
		t.Fatal(err)
	}
	store.ReadFeed = func(context.Context, string) (time.Time, error) {
		return time.Time{}, errors.New("fixture unavailable")
	}
	if err := store.InitializeFeed(ctx, f.ID); err == nil {
		t.Fatal("failure ignored")
	}
	friends, err := store.Friends(ctx, false)
	if err != nil || len(friends) != 1 || friends[0].LatestUpdate != "" {
		t.Fatal("RSS failure lost saved record", friends, err)
	}
	reads := 0
	store.ReadFeed = func(context.Context, string) (time.Time, error) {
		reads++
		return time.Date(2026, 11, 12, 8, 30, 0, 0, time.UTC), nil
	}
	if err := store.InitializeFeed(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	friends, err = store.Friends(ctx, false)
	if err != nil || friends[0].LatestUpdate != "2026-11-12T08:30:00.000Z" {
		t.Fatal(friends, err)
	}
	if err := store.InitializeFeed(ctx, f.ID); err != nil || reads != 1 {
		t.Fatal("initialized feed fetched again", reads, err)
	}
	if _, err := db.Exec("UPDATE friends SET latest_update='' WHERE id=?", f.ID); err != nil {
		t.Fatal(err)
	}
	store.ReadFeed = func(context.Context, string) (time.Time, error) {
		_, err := db.Exec("UPDATE friends SET rss_url='https://changed.example/feed' WHERE id=?", f.ID)
		if err != nil {
			t.Fatal(err)
		}
		return time.Now(), nil
	}
	if err := store.InitializeFeed(ctx, f.ID); err != nil {
		t.Fatal(err)
	}
	friends, err = store.Friends(ctx, false)
	if err != nil || friends[0].LatestUpdate != "" {
		t.Fatal("concurrent RSS edit overwritten", friends, err)
	}
}
