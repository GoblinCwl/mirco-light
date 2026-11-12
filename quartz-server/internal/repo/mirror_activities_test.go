package repo

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func jsonList(value any) any {
	raw, _ := json.Marshal(value)
	var out any
	json.Unmarshal(raw, &out)
	return out
}

func TestMirroredCommitsUseActualGitRecordsAndKnownIdentity(t *testing.T) {
	directory := fixture(t)
	raw, _, err := Git(context.Background(), directory, MaxText, nil, "log", "--branches", "-z", "--max-count=100", "--format=%H%x00%an%x00%cI")
	if err != nil {
		t.Fatal(err)
	}
	rows := mirroredCommits(string(raw), "Fixture/project", "Fixture")
	if len(rows) != 2 {
		t.Fatalf("expected actual local commits, got %v", rows)
	}
	if len(mirroredCommits(string(raw), "Other/fork", "Other")) != 0 {
		t.Fatal("upstream fork authors must not count as owner activity")
	}
	record := strings.Repeat("a", 40) + "\x00陈威龙\x002026-11-12T11:12:28+08:00\x00"
	rows = mirroredCommits(record, "GoblinCwl/project", "GoblinCwl")
	if len(rows) != 1 || rows[0]["date"] != "2026-11-12T03:12:28Z" {
		t.Fatal(rows)
	}
}

func TestMirrorActivityMergesDailyTotalsWithoutDuplicates(t *testing.T) {
	commit := func(id, date string) map[string]any {
		return map[string]any{"id": id, "repository": "Example/project", "date": date, "url": "https://github.com/Example/project/commit/" + id}
	}
	rows := []map[string]any{commit("a", "2026-11-12T03:12:28Z"), commit("b", "2026-11-12T02:00:00Z"), commit("a", "2026-11-12T03:12:28Z")}
	contributions := []map[string]any{{"id": "daily", "kind": "commit", "repository": "Example/project", "date": "2026-11-12T08:00:00Z", "text": "1 次提交"}, {"id": "issue", "kind": "issue", "date": "2026-11-11T01:00:00Z", "url": "https://github.com/Example/project/issues/1"}}
	merged := mergeMirrorActivities(jsonList(contributions), jsonList(rows))
	if len(merged) != 2 || merged[0]["text"] != "2 次提交" || merged[1]["id"] != "issue" {
		t.Fatal(merged)
	}
	contributions[0]["text"] = "5 次提交"
	merged = mergeMirrorActivities(jsonList(contributions), jsonList(rows))
	if len(merged) != 2 || merged[0]["text"] != "5 次提交" {
		t.Fatal("bounded mirror scan must not reduce full GitHub history", merged)
	}
}
