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
	Found          bool   `json:"found"`
	WorkID         string `json:"work_id,omitempty"`
	Title          string `json:"title,omitempty"`
	Type           string `json:"type,omitempty"`
	URL            string `json:"source_url,omitempty"`
	Available      bool   `json:"available"`
	RequiresUnlock bool   `json:"requires_unlock,omitempty"`
	Markdown       string `json:"markdown"`
	NextOffset     *int   `json:"next_offset,omitempty"`
}

func (s Store) GetKnowledgeBody(ctx context.Context, id, sourceURL, directory string, offset, limit int) (KnowledgeBody, error) {
	result := KnowledgeBody{WorkID: id}
	if offset < 0 || limit < 0 || limit > 16000 {
		return result, errors.Join(ErrKnowledgeQuery, errors.New("offset 不能为负数，limit 范围为 1–16000，省略 limit 返回全文"))
	}
	record, err := s.knowledgeWorkRecord(ctx, id, sourceURL)
	if err != nil || record == nil {
		return result, err
	}
	ref := knowledgeRef(*record, s.Origin)
	result.Found, result.WorkID, result.Title, result.Type, result.URL = true, ref.WorkID, ref.Title, ref.Type, ref.URL
	result.RequiresUnlock = ref.RequiresUnlock
	if ref.RequiresUnlock || ref.Type != "article" {
		return result, nil
	}
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

func (s Store) knowledgeWorkRecord(ctx context.Context, id, sourceURL string) (*Record, error) {
	if id != "" {
		records, err := readIDs(ctx, s.DB, true, []string{id})
		if err != nil || len(records) == 0 {
			return nil, err
		}
		return &records[0], nil
	}
	records, err := readMetadata(ctx, s.DB)
	if err != nil {
		return nil, err
	}
	return knowledgeRecordForURL(records, s.Origin, sourceURL)
}

func knowledgeRecordForURL(records []Record, origin, sourceURL string) (*Record, error) {
	site, siteErr := url.Parse(origin)
	target, err := url.Parse(sourceURL)
	if siteErr != nil || err != nil || target.User != nil || !strings.HasPrefix(target.Path, "/") ||
		strings.HasPrefix(sourceURL, "//") || target.IsAbs() && (target.Scheme != site.Scheme || !strings.EqualFold(target.Host, site.Host)) {
		return nil, errors.Join(ErrKnowledgeQuery, errors.New("source_url 需为本站作品链接"))
	}
	route, exists := relationRoutes(records, "", nil)[relationKey(target.Path)]
	if !exists {
		return nil, nil
	}
	for i := range records {
		if relationKey(records[i].Slug) == route {
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
