package repo

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPublicContributionsAndIssueTargets(t *testing.T) {
	var source map[string]any
	raw := `{"data":{"user":{"login":"Fixture","contributionsCollection":{"joinedGitHubContribution":{"occurredAt":"2020-01-01T00:00:00Z"},"commitContributionsByRepository":[{"repository":{"nameWithOwner":"Fixture/public","isPrivate":false},"contributions":{"nodes":[{"occurredAt":"2026-11-10T00:00:00Z","commitCount":2}]}},{"repository":{"nameWithOwner":"Fixture/private","isPrivate":true},"contributions":{"nodes":[{"occurredAt":"2026-11-10T00:00:00Z","commitCount":3}]}}],"issueContributions":{"nodes":[{"occurredAt":"2026-11-09T00:00:00Z","issue":{"number":42,"title":"Example","repository":{"nameWithOwner":"Fixture/public","isPrivate":false}}}]}}}}}`
	if err := json.Unmarshal([]byte(raw), &source); err != nil {
		t.Fatal(err)
	}
	rows, err := NormalizeContributions(source)
	if err != nil || len(rows) != 3 {
		t.Fatal("contribution parsing failed", err)
	}
	for _, row := range rows {
		if strings.Contains(stringValue(row["repository"]), "private") {
			t.Fatal("private contribution leaked")
		}
		if row["kind"] == "issue" && row["url"] != "https://github.com/Fixture/public/issues/42" {
			t.Fatal("issue target lost")
		}
	}
	source["errors"] = []any{map[string]any{"message": "denied"}}
	if _, err = NormalizeContributions(source); err == nil {
		t.Fatal("upstream errors ignored")
	}
}
