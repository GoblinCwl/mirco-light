package repo

import "testing"

func TestCodeEventRevision(t *testing.T) {
	revision := func(raw string) string {
		t.Helper()
		value, err := CodeEventRevision([]byte(raw), "Example")
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	baseline := revision(`[{"id":"1","type":"PushEvent","repo":{"name":"Example/project"}}]`)
	issues := revision(`[{"id":"3","type":"IssuesEvent","repo":{"name":"Example/project"}},{"id":"2","type":"IssueCommentEvent","repo":{"name":"Example/project"}},{"id":"1","type":"PushEvent","repo":{"name":"Example/project"}}]`)
	if baseline != issues {
		t.Fatal("issues must not trigger a mirror")
	}
	other := revision(`[{"id":"2","type":"PushEvent","repo":{"name":"Other/project"}},{"id":"1","type":"PushEvent","repo":{"name":"Example/project"}}]`)
	if baseline != other {
		t.Fatal("other owners must not trigger a mirror")
	}
	pushed := revision(`[{"id":"4","type":"PushEvent","repo":{"name":"Example/project"}},{"id":"1","type":"PushEvent","repo":{"name":"Example/project"}}]`)
	if baseline == pushed {
		t.Fatal("a new push must trigger synchronization")
	}
	if _, err := CodeEventRevision([]byte(`{"message":"error"}`), "Example"); err == nil {
		t.Fatal("invalid upstream must not checkpoint")
	}
}

func TestCodeEventWatermark(t *testing.T) {
	if newerCodeEvent("99", "100") || newerCodeEvent("0", "100") || newerCodeEvent("100", "100") {
		t.Fatal("expired events or repeated events must not trigger a pull")
	}
	if !newerCodeEvent("101", "100") {
		t.Fatal("new event must trigger a pull")
	}
}

func TestCodeActivityRevision(t *testing.T) {
	commit := map[string]any{"id": "commit:Example/project:today", "kind": "commit", "repository": "Example/project", "text": "1 次提交"}
	base := CodeActivityRevision([]any{commit}, "Example")
	issue := map[string]any{"id": "issue:new", "kind": "issue", "repository": "Example/project", "text": "new issue"}
	if base != CodeActivityRevision([]any{issue, commit}, "Example") {
		t.Fatal("issue must not change the code signature")
	}
	commit["text"] = "2 次提交"
	if base == CodeActivityRevision([]any{commit}, "Example") {
		t.Fatal("new commits in the same daily contribution must trigger synchronization")
	}
	repository := map[string]any{"id": "repository:Example/new:today", "kind": "repository", "repository": "Example/new"}
	if base == CodeActivityRevision([]any{repository}, "Example") {
		t.Fatal("a new repository must trigger synchronization")
	}
}
