package content

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestMarkdownTagsPreserveUnrelatedBytes(t *testing.T) {
	for _, fixture := range []struct{ name, before, after string }{
		{"list", "---\ntitle: '不改引号' # keep\ntags:\n  - old\n\n# next property\npublish: true\n---\n# 原文\n", "---\ntitle: '不改引号' # keep\ntags:\n  - \"new\"\n  - \"分类/标签\"\n\n# next property\npublish: true\n---\n# 原文\n"},
		{"last", "---\ntitle: Test\ntags: [old, other]\n---\nBody", "---\ntitle: Test\ntags:\n  - \"new\"\n  - \"分类/标签\"\n---\nBody"},
		{"insert", "---\ntitle: Test\n---\nBody", "---\ntitle: Test\ntags:\n  - \"new\"\n  - \"分类/标签\"\n---\nBody"},
		{"plain", "# Body\n", "---\ntags:\n  - \"new\"\n  - \"分类/标签\"\n---\n# Body\n"},
		{"alias", "---\ntag: old\n---\nBody", "---\ntag:\n  - \"new\"\n  - \"分类/标签\"\n---\nBody"},
		{"CRLF BOM", "\ufeff---\r\ntags: old\r\npublish: true\r\n---\r\nBody\r\n", "\ufeff---\r\ntags:\r\n  - \"new\"\r\n  - \"分类/标签\"\r\npublish: true\r\n---\r\nBody\r\n"},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			updated, tags, err := markdownTags([]byte(fixture.before), []string{"new", "分类/标签"})
			if err != nil || string(updated) != fixture.after {
				t.Fatalf("unexpected patch: %q, %v", updated, err)
			}
			_, read, err := markdownTags(updated, nil)
			if err != nil || !reflect.DeepEqual(read, tags) {
				t.Fatal(read, tags, err)
			}
		})
	}
}

func TestMarkdownTagsReadAndClear(t *testing.T) {
	for _, header := range []string{"tags: one, two", "tags: [one, two]", "tags:\n  - one\n  - two", "tag: [one, two]", "tags: null\ntag: [one, two]", "tag: ignored\ntags: [one, two]"} {
		raw := []byte("---\n" + header + "\n---\nbody")
		unchanged, tags, err := markdownTags(raw, nil)
		if err != nil || !bytes.Equal(raw, unchanged) || !reflect.DeepEqual(tags, []string{"one", "two"}) {
			t.Fatal(header, tags, err)
		}
		cleared, _, err := markdownTags(raw, []string{})
		if err != nil {
			t.Fatal(err)
		}
		_, tags, err = markdownTags(cleared, nil)
		if err != nil || len(tags) != 0 {
			t.Fatal(string(cleared), tags, err)
		}
	}
	for _, raw := range []string{"---\ntags: [broken\n---\nBody", "---\ntags: old\n", "---\ntags: &label [one]\nother: *label\n---\nBody"} {
		if _, _, err := markdownTags([]byte(raw), []string{"new"}); err == nil {
			t.Fatal("accepted broken YAML or destroyed an anchor", raw)
		}
	}
}

func TestArticleWritesConfinedAndConcurrentEditsPreserved(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "note.md")
	original := []byte("---\ntags: [old]\npublish: true\n---\n正文\n")
	if err := os.WriteFile(path, original, 0640); err != nil {
		t.Fatal(err)
	}
	store := Store{ArticleDirectory: dir}
	record := Record{Type: "article", Extra: map[string]any{"filePath": "note.md"}}
	_, change, err := store.prepareArticle(record, []string{"new"}, false)
	if err != nil {
		t.Fatal(err)
	}
	defer change.root.Close()
	external := append(append([]byte{}, original...), []byte("Obsidian edit\n")...)
	if err = os.WriteFile(path, external, 0640); err != nil {
		t.Fatal(err)
	}
	if err = change.replace(change.before, change.after); err == nil {
		t.Fatal("overwrote concurrent edit")
	}
	got, _ := os.ReadFile(path)
	if !bytes.Equal(got, external) {
		t.Fatal("external edit changed")
	}
	_, change2, err := store.prepareArticle(record, []string{"new"}, false)
	if err != nil {
		t.Fatal(err)
	}
	defer change2.root.Close()
	if err = change2.replace(change2.before, change2.after); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0640 {
		t.Fatal("mode lost")
	}
	got, _ = os.ReadFile(path)
	if !strings.Contains(string(got), "Obsidian edit") {
		t.Fatal("body lost")
	}
	outside := filepath.Join(t.TempDir(), "outside.md")
	os.WriteFile(outside, original, 0600)
	os.Symlink(outside, filepath.Join(dir, "linked.md"))
	os.Symlink(filepath.Dir(outside), filepath.Join(dir, "outside"))
	for _, name := range []string{"../outside.md", outside, "linked.md", "outside/outside.md", "not-markdown.txt"} {
		record.Extra["filePath"] = name
		if c, err := store.openArticle(record); err == nil {
			c.root.Close()
			t.Fatal("accepted unsafe path", name)
		}
	}
	left, _ := filepath.Glob(filepath.Join(dir, ".quartz-tags-*"))
	if len(left) != 0 {
		t.Fatal("temporary files leaked", left)
	}
}

func TestArticleBatchRollbackPreservesExternalChanges(t *testing.T) {
	dir := t.TempDir()
	store := Store{ArticleDirectory: dir}
	changes := []*articleChange{}
	for _, name := range []string{"a.md", "b.md"} {
		os.WriteFile(filepath.Join(dir, name), []byte("---\ntags: [old]\n---\nBody"), 0600)
		_, c, err := store.prepareArticle(Record{Extra: map[string]any{"filePath": name}}, []string{"new"}, false)
		if err != nil {
			t.Fatal(err)
		}
		defer c.root.Close()
		changes = append(changes, c)
	}
	os.WriteFile(filepath.Join(dir, "b.md"), []byte("External edit"), 0600)
	if _, err := applyArticles(changes); err == nil {
		t.Fatal("accepted stale batch")
	}
	a, _ := os.ReadFile(filepath.Join(dir, "a.md"))
	b, _ := os.ReadFile(filepath.Join(dir, "b.md"))
	if !bytes.Equal(a, changes[0].before) || string(b) != "External edit" {
		t.Fatal("rollback lost original or external changes")
	}
}
