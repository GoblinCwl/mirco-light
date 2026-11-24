package content

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
)

type knowledgeArticle struct {
	SourceID string `json:"sourceId"`
	Path     string `json:"path"`
	Metadata string `json:"metadata"`
	Body     string `json:"body"`
}

func validateKnowledge(articles []Item, documents []knowledgeArticle) error {
	public := make(map[string]bool, len(articles))
	for _, article := range articles {
		public[article.SourceID] = !article.Encrypted
	}
	paths := make(map[string]bool, len(documents))
	for _, doc := range documents {
		if !public[doc.SourceID] || paths[doc.Path] || !filepath.IsLocal(doc.Path) ||
			path.Clean(doc.Path) != doc.Path || path.Ext(doc.Path) != ".md" || strings.ContainsAny(doc.Path, "\\\x00") {
			return fmt.Errorf("invalid knowledge document for article %q", doc.SourceID)
		}
		delete(public, doc.SourceID)
		paths[doc.Path] = true
	}
	return nil
}

func knowledgeMarkdown(record Record, origin string, doc knowledgeArticle) string {
	var md strings.Builder
	md.WriteString("---\n")
	for _, field := range []struct{ key, value string }{
		{"work_id", record.ID},
		{"source_url", strings.TrimRight(origin, "/") + record.Href},
		{"title", record.Title},
	} {
		quoted, _ := json.Marshal(field.value)
		fmt.Fprintf(&md, "%s: %s\n", field.key, quoted)
	}
	md.WriteString("metadata:\n")
	for _, line := range strings.Split(doc.Metadata, "\n") {
		md.WriteString("  " + line + "\n")
	}
	md.WriteString("---\n\n")
	md.WriteString(doc.Body)
	return md.String()
}

func (s *ArticleSnapshot) publishKnowledge(ctx context.Context, documents []knowledgeArticle) error {
	records, err := readSource(ctx, s.Store.DB, "article")
	if err != nil {
		return err
	}
	bySource := make(map[string]Record, len(records))
	for _, record := range records {
		if !record.Encrypted {
			bySource[record.SourceID] = record
		}
	}

	root := s.KnowledgeDirectory
	releases := filepath.Join(root, ".releases")
	if err := os.MkdirAll(releases, 0700); err != nil {
		return err
	}
	release, err := os.MkdirTemp(releases, "build-")
	if err != nil {
		return err
	}
	published := false
	defer func() {
		if !published {
			_ = os.RemoveAll(release)
		}
	}()
	for _, doc := range documents {
		record, exists := bySource[doc.SourceID]
		if !exists {
			return fmt.Errorf("missing indexed knowledge article %q", doc.SourceID)
		}
		target := filepath.Join(release, doc.Path)
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		if err := os.WriteFile(target, []byte(knowledgeMarkdown(record, s.Store.Origin, doc)), 0600); err != nil {
			return err
		}
	}
	current := filepath.Join(root, "current")
	previous, _ := os.Readlink(current)
	name := filepath.Base(release)
	pointer := filepath.Join(".releases", name)
	next := filepath.Join(root, ".current-"+name)
	if err := os.Symlink(pointer, next); err != nil {
		return err
	}
	defer os.Remove(next)
	if err := os.Rename(next, current); err != nil {
		return err
	}
	published = true
	// Keep one preceding release so a reader can finish a scan begun before the swap.
	entries, _ := os.ReadDir(releases)
	for _, entry := range entries {
		base := entry.Name()
		if entry.IsDir() && strings.HasPrefix(base, "build-") && base != name && filepath.Join(".releases", base) != previous {
			_ = os.RemoveAll(filepath.Join(releases, base))
		}
	}
	return nil
}
