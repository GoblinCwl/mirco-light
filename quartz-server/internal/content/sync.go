package content

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/journal"
	"regexp"
	"strings"
	"time"
	"unicode"
)

type Item struct {
	ReferenceContent string         `json:"-"`
	SourceID         string         `json:"sourceId"`
	Slug             string         `json:"slug"`
	Href             string         `json:"href"`
	Title            string         `json:"title"`
	Content          string         `json:"content"`
	Description      string         `json:"description"`
	Tags             []string       `json:"tags"`
	Links            []string       `json:"links"`
	PublishedAt      string         `json:"publishedAt"`
	UpdatedAt        string         `json:"updatedAt"`
	Encrypted        bool           `json:"encrypted"`
	EventRevision    string         `json:"eventRevision"`
	Extra            map[string]any `json:"extra"`
}

func uuid() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = b[6]&15 | 64
	b[8] = b[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
func jsJSON(value any) string {
	var b bytes.Buffer
	encoder := json.NewEncoder(&b)
	encoder.SetEscapeHTML(false)
	encoder.Encode(value)
	return strings.TrimSuffix(b.String(), "\n")
}
func semanticDigest(value any) string {
	sum := sha256.Sum256([]byte(jsJSON(value)))
	return hex.EncodeToString(sum[:])
}

// Search schema changes for the two expanded sources must not emit article updates.
func recordRevision(kind, title, body, description string, tags, links []string, encrypted bool, event string) string {
	parts := []any{title, body, description, tags, links, encrypted, event}
	if kind == "repo" || kind == "share" {
		parts = append(parts, "search-v2")
	}
	return semanticDigest(parts)
}
func searchBody(kind, body, description string) string {
	if kind == "repo" || kind == "share" {
		return body + "\n" + description
	}
	return body
}
func sourceTagsNormalized(values []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		if value == "" {
			continue
		}
		value = strings.Map(func(c rune) rune {
			if unicode.IsSpace(c) {
				return '-'
			}
			return c
		}, value)
		value = strings.NewReplacer("&", "-and-", "%", "-percent", "?", "", "#", "").Replace(value)
		if !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	return out
}
func unique(values []string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	return out
}

var encryptedBlock = regexp.MustCompile(`(?s)🔐[βγ]\s*.*?🔐`)
var encryptedTail = regexp.MustCompile(`(?s)🔐[βγ].*$`)

func excerpt(s string) string {
	return clip(encryptedTail.ReplaceAllString(encryptedBlock.ReplaceAllString(s, "[加密文本]"), "[加密文本]"), 400)
}
func canonicalDate(s string) *string {
	parsed, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return nil
	}
	value := parsed.UTC().Format("2006-01-02T15:04:05.000Z")
	return &value
}
func firstDate(values ...*string) *string {
	for _, v := range values {
		if v != nil {
			return v
		}
	}
	return nil
}
func encodeSlug(slug string) string {
	const hexChars = "0123456789ABCDEF"
	var b strings.Builder
	b.WriteByte('/')
	for _, v := range []byte(slug) {
		if v >= 'a' && v <= 'z' || v >= 'A' && v <= 'Z' || v >= '0' && v <= '9' || strings.ContainsRune("-_.!~*'()/", rune(v)) {
			b.WriteByte(v)
		} else {
			b.WriteByte('%')
			b.WriteByte(hexChars[v>>4])
			b.WriteByte(hexChars[v&15])
		}
	}
	if !strings.HasSuffix(slug, "/") {
		b.WriteByte('/')
	}
	return b.String()
}
func (s Store) Sync(ctx context.Context, kind string, input []Item) error {
	if kind != "article" && kind != "share" && kind != "repo" && kind != "video" || input == nil {
		return errors.New("内容来源无效或未完成")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var lock string
	if err = tx.QueryRowContext(ctx, "SELECT name FROM resource_locks WHERE name='content' FOR UPDATE").Scan(&lock); err != nil {
		return err
	}
	records, err := readSource(ctx, tx, kind)
	if err != nil {
		return err
	}
	previous := map[string]Record{}
	for _, r := range records {
		if r.Type == kind {
			previous[r.SourceID] = r
		}
	}
	var known int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM content_sources WHERE type=?", kind).Scan(&known); err != nil {
		return err
	}
	at := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	keys := map[string]bool{}
	events := []map[string]any{}
	changed := known == 0
	for _, item := range input {
		if item.SourceID == "" || item.Title == "" || item.Slug == "" || strings.HasPrefix(item.Slug, "/") || containsPart(item.Slug, "..") || keys[item.SourceID] {
			return errors.New("内容条目无效或重复")
		}
		keys[item.SourceID] = true
		old, exists := previous[item.SourceID]
		identity := kind + ":" + item.SourceID
		if kind == "share" && !exists {
			var uid string
			err = tx.QueryRowContext(ctx, "SELECT uid FROM share_identities WHERE source_id=?", item.SourceID).Scan(&uid)
			if err == sql.ErrNoRows {
				uid, err = uuid()
				if err != nil {
					return err
				}
				if _, err = tx.ExecContext(ctx, "INSERT INTO share_identities(source_id,uid) VALUES(?,?)", item.SourceID, uid); err != nil {
					return err
				}
			} else if err != nil {
				return err
			}
			identity = "share:" + uid
		}
		if exists {
			identity = old.ID
		}
		tags := sourceTagsNormalized(item.Tags)
		sourceTags := append([]string{}, tags...)
		// Explicitly maintained labels are the final set in the index itself.
		managed := kind != "article" && exists && old.Extra["tagsManaged"] == true
		if managed {
			tags = append([]string{}, old.Tags...)
		}
		links := unique(item.Links)
		if kind != "article" && !item.Encrypted {
			links = unique(append(links, projectLinks(s.Origin, item.Content+"\n"+item.Description+"\n"+item.ReferenceContent, item.Slug)...))
		} else if kind == "share" && item.Encrypted {
			links = unique(append(links, projectLinks(s.Origin, item.ReferenceContent, item.Slug)...))
		}
		body, description := item.Content, item.Description
		if item.Encrypted {
			body = ""
			description = ""
		} else if kind == "article" {
			if description == "" {
				description = body
			}
			description = excerpt(description)
		}
		extra := map[string]any{}
		for k, v := range item.Extra {
			extra[k] = v
		}
		extra["sourceTags"] = sourceTags
		if managed {
			extra["tagsManaged"] = true
		}
		published := canonicalDate(item.PublishedAt)
		if kind != "share" {
			published = firstDate(old.Published, published, &at)
		}
		updated := published
		if kind != "share" {
			updated = firstDate(canonicalDate(item.UpdatedAt), canonicalDate(item.PublishedAt), old.Updated, &at)
		}
		revision := recordRevision(kind, item.Title, body, description, tags, links, item.Encrypted, item.EventRevision)
		href := item.Href
		if href == "" {
			href = encodeSlug(item.Slug)
		}
		// Body/search text stay out of the metadata query: revision covers their
		// source fields. Routes, dates and extra metadata are compared separately.
		if exists && old.Slug == item.Slug && old.Href == href && old.Revision == revision && old.EventRevision == item.EventRevision && sameDate(old.Published, published) && sameDate(old.Updated, updated) && jsJSON(old.Extra) == jsJSON(extra) {
			continue
		}
		changed = true
		bodyText, searchTags := "", ""
		if !item.Encrypted {
			bodyText = searchBody(kind, body, description)
			searchTags = strings.Join(tags, " ")
		}
		search := normalize(strings.Join([]string{item.Title, bodyText, searchTags}, "\n"))
		if _, err = tx.ExecContext(ctx, "INSERT INTO content(id,type,source_id,slug,href,title,content,description,tags,links,published_at,updated_at,encrypted,revision,event_revision,search_text,extra) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE slug=VALUES(slug),href=VALUES(href),title=VALUES(title),content=VALUES(content),description=VALUES(description),tags=VALUES(tags),links=VALUES(links),published_at=VALUES(published_at),updated_at=VALUES(updated_at),encrypted=VALUES(encrypted),revision=VALUES(revision),event_revision=VALUES(event_revision),search_text=VALUES(search_text),extra=VALUES(extra)", identity, kind, item.SourceID, item.Slug, href, item.Title, body, description, jsJSON(tags), jsJSON(links), published, updated, item.Encrypted, revision, item.EventRevision, search, jsJSON(extra)); err != nil {
			return err
		}
		if known > 0 && (!exists || old.Revision != revision && (kind == "article" || kind == "repo" && item.EventRevision != old.EventRevision)) {
			events = append(events, map[string]any{"title": item.Title, "slug": item.Slug, "href": href, "type": kind})
		}
	}
	for id := range previous {
		if !keys[id] {
			changed = true
			if _, err = tx.ExecContext(ctx, "DELETE FROM content WHERE type=? AND source_id=?", kind, id); err != nil {
				return err
			}
		}
	}
	if !changed {
		return tx.Commit()
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO content_sources(type,checked_at) VALUES(?,?) ON DUPLICATE KEY UPDATE checked_at=VALUES(checked_at)", kind, at); err != nil {
		return err
	}
	if len(events) > 0 {
		titles := []string{}
		for _, event := range events {
			titles = append(titles, event["title"].(string))
		}
		id, err := uuid()
		if err != nil {
			return err
		}
		payload := map[string]any{"titles": titles, "articles": events, "count": len(events), "source": kind}
		if err = journal.Append(ctx, tx, "content", payload, at, "content:"+id); err != nil {
			return err
		}
	}
	if err = refreshFeed(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}
func sameDate(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func containsPart(path, part string) bool {
	for _, p := range strings.Split(path, "/") {
		if p == part {
			return true
		}
	}
	return false
}

func (s Store) RenameShare(ctx context.Context, before, after string) error {
	if before == after {
		return nil
	}
	if before == "" || after == "" {
		return errors.New("分享标识无效")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var held string
	if err = tx.QueryRowContext(ctx, "SELECT name FROM resource_locks WHERE name='content' FOR UPDATE").Scan(&held); err != nil {
		return err
	}
	var uid string
	err = tx.QueryRowContext(ctx, "SELECT uid FROM share_identities WHERE source_id=?", before).Scan(&uid)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM content WHERE type='share' AND source_id=?", after); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM share_identities WHERE source_id=?", after); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE share_identities SET source_id=? WHERE source_id=?", after, before); err != nil {
		return err
	}
	slug := "Share/分享/" + after
	if _, err = tx.ExecContext(ctx, "UPDATE content SET source_id=?,slug=?,href=? WHERE type='share' AND source_id=?", after, slug, encodeSlug(slug), before); err != nil {
		return err
	}
	if err = refreshFeed(ctx, tx); err != nil {
		return err
	}
	return tx.Commit()
}
