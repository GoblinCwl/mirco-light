package content

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

type KnowledgeBody struct {
	Found      bool   `json:"found"`
	WorkID     string `json:"work_id,omitempty"`
	Title      string `json:"title,omitempty"`
	URL        string `json:"source_url,omitempty"`
	Available  bool   `json:"available"`
	Markdown   string `json:"markdown"`
	NextOffset *int   `json:"next_offset,omitempty"`
}

func (s Store) GetKnowledgeBody(ctx context.Context, id, sourceURL, directory string, offset, limit int) (KnowledgeBody, error) {
	result := KnowledgeBody{WorkID: id}
	if offset < 0 || limit < 0 || limit > 16000 {
		return result, errors.Join(ErrKnowledgeQuery, errors.New("offset 不能为负数，limit 范围为 1–16000，省略 limit 返回全文"))
	}
	record, err := s.knowledgeArticleRecord(ctx, id, sourceURL)
	if err != nil || record == nil {
		return result, err
	}
	ref := knowledgeRef(*record, s.Origin)
	result.Found, result.WorkID, result.Title, result.URL = true, ref.WorkID, ref.Title, ref.URL
	document, err := publishedKnowledgeMarkdown(directory, *record)
	if err != nil || document == "" {
		return result, err
	}
	result.Available = true
	for skipped := 0; skipped < offset && document != ""; skipped++ {
		_, size := utf8.DecodeRuneInString(document)
		document = document[size:]
	}
	if limit == 0 {
		result.Markdown = document
		return result, nil
	}
	end := 0
	for count := 0; count < limit && end < len(document); count++ {
		_, size := utf8.DecodeRuneInString(document[end:])
		end += size
	}
	result.Markdown = document[:end]
	if end < len(document) {
		next := offset + limit
		result.NextOffset = &next
	}
	return result, nil
}

func (s Store) knowledgeArticleRecord(ctx context.Context, id, sourceURL string) (*Record, error) {
	if id != "" {
		records, err := selectRecords(ctx, s.DB, true, " WHERE id=? AND type='article' AND encrypted=0", []any{id})
		if err != nil || len(records) == 0 {
			return nil, err
		}
		return &records[0], nil
	}
	site, siteErr := url.Parse(s.Origin)
	target, err := url.Parse(sourceURL)
	if siteErr != nil || err != nil || target.User != nil || !strings.HasPrefix(target.Path, "/") ||
		strings.HasPrefix(sourceURL, "//") || target.IsAbs() && (target.Scheme != site.Scheme || !strings.EqualFold(target.Host, site.Host)) {
		return nil, errors.Join(ErrKnowledgeQuery, errors.New("source_url 需为本站文章链接"))
	}
	records, err := readSource(ctx, s.DB, "article")
	if err != nil {
		return nil, err
	}
	route, exists := relationRoutes(records, "", nil)[relationKey(target.Path)]
	if !exists {
		return nil, nil
	}
	for i := range records {
		if relationKey(records[i].Slug) == route {
			if records[i].Encrypted {
				return nil, nil
			}
			return &records[i], nil
		}
	}
	return nil, nil
}

func publishedKnowledgeMarkdown(directory string, record Record) (string, error) {
	path, _ := record.Extra["filePath"].(string)
	if directory == "" || !filepath.IsLocal(path) || filepath.Ext(path) != ".md" {
		return "", nil
	}
	root, err := os.OpenRoot(filepath.Join(directory, "current"))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	defer root.Close()
	raw, err := root.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	id, _ := json.Marshal(record.ID)
	if !strings.HasPrefix(string(raw), "---\nwork_id: "+string(id)+"\n") {
		return "", nil
	}
	return string(raw), nil
}
