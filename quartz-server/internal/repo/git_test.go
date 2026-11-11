package repo

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("repository fixtures require Git")
	}
	root := t.TempDir()
	run := func(args ...string) {
		all := append([]string{"-C", root}, args...)
		if output, err := exec.Command("git", all...).CombinedOutput(); err != nil {
			t.Fatalf("fixture git: %s %v", output, err)
		}
	}
	run("init", "-b", "main")
	run("config", "user.email", "fixture@example.invalid")
	run("config", "user.name", "Fixture")
	os.Mkdir(filepath.Join(root, "src"), 0700)
	os.WriteFile(filepath.Join(root, "README.md"), []byte("hello\n"), 0600)
	os.WriteFile(filepath.Join(root, "src", "main.go"), []byte("package main\n"), 0600)
	os.Symlink("../outside-secret", filepath.Join(root, "link"))
	run("add", ".")
	run("commit", "-m", "initial")
	os.WriteFile(filepath.Join(root, "README.md"), []byte("second\n"), 0600)
	run("add", "README.md")
	run("commit", "-m", "update readme")
	return filepath.Join(root, ".git")
}
func TestGitReadOnlyViews(t *testing.T) {
	directory := fixture(t)
	ctx := context.Background()
	sha, err := Resolve(ctx, directory, "main")
	if err != nil {
		t.Fatal(err)
	}
	tree, err := Directory(ctx, directory, sha, "")
	if err != nil {
		t.Fatal(err)
	}
	if tree["historyComplete"] != true {
		t.Fatal("directory commit metadata incomplete")
	}
	entries := tree["entries"].([]map[string]any)
	if len(entries) != 3 || entries[0]["type"] != "directory" {
		t.Fatal("directory sorting changed")
	}
	file, err := File(ctx, directory, sha, "link", MaxText)
	if err != nil || file["content"] != "../outside-secret" {
		t.Fatal("symlink dereferenced", err)
	}
	raw, truncated, err := Git(ctx, directory, 2, nil, "cat-file", "blob", sha+":README.md")
	if err != nil || !truncated || string(raw) != "se" {
		t.Fatal("output bound failed", err)
	}
}
func TestGitInputs(t *testing.T) {
	for _, path := range []string{"/private", "a/../b", "../x", "a\\b", "a\x00b"} {
		if _, err := SafePath(path); err == nil {
			t.Errorf("accepted path %q", path)
		}
	}
	directory := fixture(t)
	for _, ref := range []string{"--help", "", strings.Repeat("a", 257), "main\x00x"} {
		if _, err := Resolve(context.Background(), directory, ref); err == nil {
			t.Errorf("accepted ref %q", ref)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := Git(ctx, directory, MaxText, nil, "log"); err == nil {
		t.Fatal("canceled request ran git")
	}
}

func TestRepositoryIndexReadsDefaultBranchReadme(t *testing.T) {
	directory := fixture(t)
	root := filepath.Dir(filepath.Dir(directory))
	target := filepath.Join(root, "example.git")
	if err := os.Rename(directory, target); err != nil {
		t.Fatal(err)
	}
	catalog := filepath.Join(root, "catalog.json")
	if err := os.WriteFile(catalog, []byte(`{"completedAt":"2026-11-10T00:00:00Z"}`), 0600); err != nil {
		t.Fatal(err)
	}
	adapter := &Adapter{Root: root, CatalogFile: catalog}
	_, err := adapter.Cache.Get(context.Background(), "catalog", time.Hour, false, func(context.Context) (map[string]any, error) {
		return map[string]any{"repositories": []map[string]any{{"name": "example", "id": float64(1), "default_branch": "main", "language": "Go"}}}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		items, err := adapter.Content(context.Background())
		if err != nil || len(items) != 1 {
			t.Fatal(items, err)
		}
		if items[0].Extra["hasReadme"] != true {
			t.Fatal("README preview availability missing")
		}
		if items[0].Content != "second\n" {
			t.Fatal("wrong branch or README", items)
		}
	}
}

func TestCommitDisplayAliasKeepsGitObjectsUnchanged(t *testing.T) {
	dir := fixture(t)
	ctx := context.Background()
	if _, _, err := Git(ctx, dir, MaxText, nil, "-c", "user.name=陈威龙", "-c", "user.email=alias@example.invalid", "commit", "--allow-empty", "-m", "alias fixture"); err != nil {
		t.Fatal(err)
	}
	sha, err := Resolve(ctx, dir, "main")
	if err != nil {
		t.Fatal(err)
	}
	tree, err := Directory(ctx, dir, sha, "")
	if err != nil {
		t.Fatal(err)
	}
	if tree["latestCommit"].(map[string]any)["author"] != "GoblinCwl" {
		t.Fatal("latest commit did not use public identity")
	}
	if commit([]string{sha, "陈威龙", "2026-11-11", "test"})["author"] != "GoblinCwl" {
		t.Fatal("history identity not mapped")
	}
	raw, _, err := Git(ctx, dir, MaxText, nil, "log", "-1", "--format=%an", sha)
	if err != nil || strings.TrimSpace(string(raw)) != "陈威龙" {
		t.Fatal("original Git identity was modified", err)
	}
	if commitAuthor("Other") != "Other" {
		t.Fatal("unrelated author changed")
	}
}
