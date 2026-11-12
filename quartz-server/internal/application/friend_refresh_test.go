package application

import (
	"testing"
	"time"
)

func TestNextFriendRefreshUsesBeijingSixAM(t *testing.T) {
	for _, c := range []struct{ now, want string }{
		{"2026-11-12T21:59:59Z", "2026-11-13T06:00:00+08:00"},
		{"2026-11-12T22:00:00Z", "2026-11-14T06:00:00+08:00"},
		{"2026-11-12T23:00:00Z", "2026-11-14T06:00:00+08:00"},
		{"2026-12-31T23:00:00+08:00", "2027-01-01T06:00:00+08:00"},
	} {
		now, err := time.Parse(time.RFC3339, c.now)
		if err != nil {
			t.Fatal(err)
		}
		got := nextFriendRefresh(now)
		if got.Format(time.RFC3339) != c.want {
			t.Fatal(c, got)
		}
	}
}

func TestNextFriendRefreshConfiguredClock(t *testing.T) {
	for _, c := range []struct{ now, clock, want string }{
		{"2026-11-13T01:00:00Z", "09:30", "2026-11-13T09:30:00+08:00"},
		{"2026-11-13T01:30:00Z", "09:30", "2026-11-14T09:30:00+08:00"},
		{"2026-12-31T16:00:00Z", "00:00", "2027-01-02T00:00:00+08:00"},
	} {
		now, _ := time.Parse(time.RFC3339, c.now)
		if got := nextFriendRefreshAt(now, c.clock).Format(time.RFC3339); got != c.want {
			t.Fatal(got, c.want)
		}
	}
}

func TestFriendRefreshDayCadenceSurvivesRestart(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-11-13T01:00:00Z")
	first := nextFriendRefreshSchedule(now, "09:30", 3)
	// A restart before the planned run must retain exactly the same calendar slot.
	if got := nextFriendRefreshSchedule(first.Add(-time.Minute), "09:30", 3); !got.Equal(first) {
		t.Fatal(first, got)
	}
	if got := nextFriendRefreshSchedule(first, "09:30", 3); !got.Equal(first.AddDate(0, 0, 3)) {
		t.Fatal("cadence changed", first, got)
	}
}
