package content

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"golang.org/x/text/unicode/norm"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Store struct {
	DB               *sql.DB
	Origin           string
	ArticleDirectory string
}
type Record struct {
	ID, Type, SourceID, Slug, Href, Title, Body, Description string
	Tags, Links                                              []string
	Published, Updated                                       *string
	Encrypted                                                bool
	Revision, EventRevision, Search                          string
	Extra                                                    map[string]any
}
type Page struct {
	ID          string         `json:"id"`
	Type        string         `json:"type"`
	Slug        string         `json:"slug"`
	FilePath    string         `json:"filePath"`
	Href        string         `json:"href"`
	Title       string         `json:"title"`
	Content     string         `json:"content"`
	Description string         `json:"description"`
	Tags        []string       `json:"tags"`
	Links       []string       `json:"links"`
	Encrypted   bool           `json:"encrypted"`
	CreatedAt   *string        `json:"createdAt"`
	UpdatedAt   *string        `json:"updatedAt"`
	Extra       map[string]any `json:"extra"`
}

func wire(r Record) Page {
	description := r.Description
	if r.Encrypted {
		description = ""
	}
	filePath := r.Slug
	if r.Type == "article" {
		if original, ok := r.Extra["filePath"].(string); ok && original != "" {
			filePath = original
		}
	}
	return Page{r.ID, r.Type, r.Slug, filePath, r.Href, r.Title, "", description, r.Tags, r.Links, r.Encrypted, r.Published, r.Updated, r.Extra}
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func read(ctx context.Context, db queryer) ([]Record, error) { return readRecords(ctx, db, false) }
func readMetadata(ctx context.Context, db queryer) ([]Record, error) {
	return readRecords(ctx, db, true)
}
func readRecords(ctx context.Context, db queryer, metadataOnly bool) ([]Record, error) {
	return selectRecords(ctx, db, metadataOnly, "", nil)
}
func readIDs(ctx context.Context, db queryer, metadataOnly bool, ids []string) ([]Record, error) {
	if len(ids) == 0 {
		return []Record{}, nil
	}
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	return selectRecords(ctx, db, metadataOnly, " WHERE id IN ("+strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")+")", args)
}
func readSource(ctx context.Context, db queryer, kind string) ([]Record, error) {
	return selectRecords(ctx, db, true, " WHERE type=?", []any{kind})
}

// Conditions are internal SQL fragments; every caller-supplied value is bound.
func selectRecords(ctx context.Context, db queryer, metadataOnly bool, condition string, args []any) ([]Record, error) {
	body, search := "content", "search_text"
	if metadataOnly {
		body = "'' AS content"
		search = "'' AS search_text"
	}
	rows, err := db.QueryContext(ctx, "SELECT id,type,source_id,slug,href,title,"+body+",description,tags,links,published_at,updated_at,encrypted,revision,event_revision,"+search+",extra FROM content"+condition+" ORDER BY updated_at DESC,id", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Record{}
	for rows.Next() {
		var r Record
		var tags, links, extra string
		if err = rows.Scan(&r.ID, &r.Type, &r.SourceID, &r.Slug, &r.Href, &r.Title, &r.Body, &r.Description, &tags, &links, &r.Published, &r.Updated, &r.Encrypted, &r.Revision, &r.EventRevision, &r.Search, &extra); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(tags), &r.Tags); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(links), &r.Links); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(extra), &r.Extra); err != nil {
			return nil, err
		}
		if r.Tags == nil {
			r.Tags = []string{}
		}
		if r.Links == nil {
			r.Links = []string{}
		}
		if r.Extra == nil {
			r.Extra = map[string]any{}
		}
		result = append(result, r)
	}
	return result, rows.Err()
}
func (s Store) Catalog(ctx context.Context) (map[string]any, error) {
	rows, err := readMetadata(ctx, s.DB)
	if err != nil {
		return nil, err
	}
	pages := map[string]Page{}
	for _, row := range rows {
		pages[row.Slug] = wire(row)
	}
	return map[string]any{"revision": digest(pages), "pages": pages}, nil
}
func (s Store) Recent(ctx context.Context) ([]Page, error) {
	rows, err := readMetadata(ctx, s.DB)
	if err != nil {
		return nil, err
	}
	if len(rows) > 5 {
		rows = rows[:5]
	}
	out := []Page{}
	for _, r := range rows {
		out = append(out, wire(r))
	}
	return out, nil
}
func normalize(s string) string { return strings.ToLower(norm.NFKC.String(s)) }
func clip(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}
func (s Store) Search(ctx context.Context, query string) ([]Page, error) {
	query = clip(strings.TrimSpace(normalize(query)), 200)
	out := []Page{}
	if query == "" {
		return out, nil
	}
	terms := strings.Fields(query)
	tag := ""
	if strings.HasPrefix(query, "#") {
		tag = strings.TrimPrefix(terms[0], "#")
		terms = terms[1:]
	}
	if len(terms) == 0 && tag == "" {
		return out, nil
	}
	rows, err := read(ctx, s.DB)
	if err != nil {
		return nil, err
	}
	matches := []Record{}
	for _, r := range rows {
		ok := true
		for _, term := range terms {
			if !strings.Contains(r.Search, term) {
				ok = false
				break
			}
		}
		if !ok {
			continue
		}
		if tag != "" {
			ok = false
			for _, t := range r.Tags {
				if strings.Contains(strings.ToLower(t), tag) {
					ok = true
					break
				}
			}
		}
		if ok {
			matches = append(matches, r)
		}
	}
	titleQuery := strings.Join(terms, " ")
	if len(terms) == 0 {
		titleQuery = tag
	}
	sort.SliceStable(matches, func(i, j int) bool {
		return strings.Contains(strings.ToLower(matches[i].Title), titleQuery) && !strings.Contains(strings.ToLower(matches[j].Title), titleQuery)
	})
	if len(matches) > 8 {
		matches = matches[:8]
	}
	needle := tag
	if len(terms) > 0 {
		needle = terms[0]
	}
	for _, r := range matches {
		p := wire(r)
		if !r.Encrypted {
			body := []rune(r.Body)
			at := strings.Index(normalize(r.Body), needle)
			if at < 0 {
				at = 0
			} else {
				at = utf8.RuneCountInString(normalize(r.Body)[:at]) - 80
			}
			if at < 0 {
				at = 0
			}
			if at > len(body) {
				at = len(body)
			}
			end := at + 600
			if end > len(body) {
				end = len(body)
			}
			p.Content = string(body[at:end])
		}
		out = append(out, p)
	}
	return out, nil
}
func digest(value any) string {
	raw, _ := json.Marshal(value)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}
func tagsNormalized(values []string) ([]string, error) {
	if values == nil || len(values) > 50 {
		return nil, errors.New("标签格式无效，最多 50 个标签")
	}
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || utf8.RuneCountInString(value) > 100 {
			return nil, errors.New("标签不能为空或超过 100 字")
		}
		for _, c := range value {
			if c < 32 || c == 127 {
				return nil, errors.New("标签包含控制字符")
			}
		}
		for _, part := range strings.Split(value, "/") {
			if part == "" || part == "." || part == ".." {
				return nil, errors.New("标签路径无效")
			}
		}
		value = strings.Map(func(c rune) rune {
			if unicode.IsSpace(c) {
				return '-'
			}
			return c
		}, value)
		value = strings.NewReplacer("&", "-and-", "%", "-percent", "?", "", "#", "").Replace(value)
		if value == "" {
			return nil, errors.New("标签不能为空")
		}
		if !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	return out, nil
}
func (s Store) Tags(ctx context.Context, id string) (map[string]any, error) {
	rows, err := readIDs(ctx, s.DB, true, []string{id})
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if r.ID == id {
			if r.Type == "article" {
				tags, err := s.articleTags(r)
				if err != nil {
					return nil, err
				}
				r.Tags = tags
				r.Extra = map[string]any{"sourceTags": tags}
			}
			return tagState(r), nil
		}
	}
	return nil, errors.New("内容不存在")
}
func sourceTags(r Record) []string {
	if raw, ok := r.Extra["sourceTags"].([]any); ok {
		out := []string{}
		for _, v := range raw {
			if s, ok := v.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return r.Tags
}
func tagState(r Record) map[string]any {
	return map[string]any{"id": r.ID, "title": r.Title, "tags": r.Tags, "sourceTags": sourceTags(r)}
}
func (s Store) EditTags(ctx context.Context, id string, values []string, reset bool) (map[string]any, error) {
	articleTagWrites.Lock()
	defer articleTagWrites.Unlock()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var lock string
	if err = tx.QueryRowContext(ctx, "SELECT name FROM resource_locks WHERE name='content' FOR UPDATE").Scan(&lock); err != nil {
		return nil, err
	}
	rows, err := readIDs(ctx, tx, false, []string{id})
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if r.ID != id {
			continue
		}
		var changes []*articleChange
		defer func() {
			for _, c := range changes {
				c.root.Close()
			}
		}()
		r, err = s.edit(ctx, tx, r, values, reset, &changes)
		if err != nil {
			return nil, err
		}
		if err = refreshFeed(ctx, tx); err != nil {
			return nil, err
		}
		rollback, err := applyArticles(changes)
		if err != nil {
			return nil, err
		}
		if err = tx.Commit(); err != nil {
			return nil, errors.Join(err, rollback())
		}
		return tagState(r), nil
	}
	return nil, errors.New("内容不存在")
}
func (s Store) edit(ctx context.Context, tx *sql.Tx, r Record, values []string, reset bool, changes *[]*articleChange) (Record, error) {
	if r.Type == "article" {
		updated, change, err := s.prepareArticle(r, values, reset)
		if err != nil {
			return r, err
		}
		*changes = append(*changes, change)
		return updated, nil
	}
	source := sourceTags(r)
	if _, exists := r.Extra["sourceTags"]; !exists {
		r.Extra["sourceTags"] = source
	}
	tags := source
	var err error
	if !reset {
		tags, err = tagsNormalized(values)
		if err != nil {
			return r, err
		}
	}
	if reset {
		delete(r.Extra, "tagsManaged")
	} else {
		r.Extra["tagsManaged"] = true
	}
	r.Tags = tags
	raw, _ := json.Marshal(tags)
	r.Revision = recordRevision(r.Type, r.Title, r.Body, r.Description, tags, r.Links, r.Encrypted, r.EventRevision)
	body, tagText := "", ""
	if !r.Encrypted {
		body = searchBody(r.Type, r.Body, r.Description)
		tagText = strings.Join(tags, " ")
	}
	r.Search = normalize(strings.Join([]string{r.Title, body, tagText}, "\n"))
	_, err = tx.ExecContext(ctx, "UPDATE content SET tags=?,revision=?,search_text=?,extra=? WHERE id=?", string(raw), r.Revision, r.Search, jsJSON(r.Extra), r.ID)
	return r, err
}
func contains(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
func (s Store) ChangeTag(ctx context.Context, tag string, ids []string, remove bool) error {
	articleTagWrites.Lock()
	defer articleTagWrites.Unlock()
	var changes []*articleChange
	defer func() {
		for _, c := range changes {
			c.root.Close()
		}
	}()
	tags, err := tagsNormalized([]string{tag})
	if err != nil {
		return err
	}
	tag = tags[0]
	if len(ids) < 1 || len(ids) > 200 {
		return errors.New("请选择 1 至 200 项内容")
	}
	wanted := map[string]bool{}
	for _, id := range ids {
		wanted[id] = true
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
	records, err := readIDs(ctx, tx, false, ids)
	if err != nil {
		return err
	}
	for _, r := range records {
		if !wanted[r.ID] {
			continue
		}
		delete(wanted, r.ID)
		transform := func(current []string) ([]string, error) {
			values := []string{}
			for _, t := range current {
				if !remove || t != tag && !strings.HasPrefix(t, tag+"/") {
					values = append(values, t)
				}
			}
			if !remove && !contains(values, tag) {
				values = append(values, tag)
			}
			return tagsNormalized(values)
		}
		if r.Type == "article" {
			_, change, err := s.prepareArticleTransform(r, transform)
			if err != nil {
				return err
			}
			changes = append(changes, change)
		} else {
			values, err := transform(r.Tags)
			if err != nil {
				return err
			}
			if _, err = s.edit(ctx, tx, r, values, false, &changes); err != nil {
				return err
			}
		}
	}
	if len(wanted) > 0 {
		return errors.New("内容不存在")
	}
	if err = refreshFeed(ctx, tx); err != nil {
		return err
	}
	rollback, err := applyArticles(changes)
	if err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return errors.Join(err, rollback())
	}
	return nil
}
func refreshFeed(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, "SELECT id,revision,published_at,updated_at,href FROM content WHERE encrypted=0 ORDER BY updated_at DESC,id LIMIT 50")
	if err != nil {
		return err
	}
	values := []map[string]any{}
	for rows.Next() {
		var id, revision, href string
		var published, updated *string
		if err = rows.Scan(&id, &revision, &published, &updated, &href); err != nil {
			rows.Close()
			return err
		}
		values = append(values, map[string]any{"id": id, "revision": revision, "published_at": published, "updated_at": updated, "href": href})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	hash := digest(values)
	var old string
	err = tx.QueryRowContext(ctx, "SELECT value FROM content_meta WHERE `key`='feed_hash'").Scan(&old)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if old == hash {
		return nil
	}
	for key, value := range map[string]string{"feed_hash": hash, "feed_updated": time.Now().UTC().Format("2006-01-02T15:04:05.000Z")} {
		if _, err = tx.ExecContext(ctx, "INSERT INTO content_meta(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)", key, value); err != nil {
			return err
		}
	}
	return nil
}
func escaped(s string) string {
	var b strings.Builder
	xml.EscapeText(&b, []byte(s))
	return b.String()
}
func (s Store) RSS(ctx context.Context) (string, error) {
	records, err := readMetadata(ctx, s.DB)
	if err != nil {
		return "", err
	}
	items := rssItems(records)
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>微光集</title><link>` + escaped(s.Origin) + `</link><description>微光集的文章、分享、仓库与视频</description><language>zh-cn</language>`)
	var latest string
	err = s.DB.QueryRowContext(ctx, "SELECT value FROM content_meta WHERE `key`='feed_updated'").Scan(&latest)
	if err != nil && err != sql.ErrNoRows {
		return "", err
	}
	if parsed, err := time.Parse(time.RFC3339Nano, latest); err == nil {
		b.WriteString("<lastBuildDate>" + parsed.UTC().Format(time.RFC1123Z) + "</lastBuildDate>")
	}
	for _, r := range items {
		perma := "false"
		guid := "urn:weiguanji:" + r.ID
		if r.Type == "article" {
			perma = "true"
			guid = s.Origin + r.Href
		}
		fmt.Fprintf(&b, "<item><title>%s</title><link>%s</link><guid isPermaLink=%q>%s</guid>", escaped(rssTitle(r)), escaped(s.Origin+r.Href), perma, escaped(guid))
		if r.Published != nil {
			if p, err := time.Parse(time.RFC3339Nano, *r.Published); err == nil {
				b.WriteString("<pubDate>" + p.UTC().Format(time.RFC1123Z) + "</pubDate>")
			}
		}
		poster := rssPosterURL(s.Origin, r.Type)
		description := r.Description
		if poster != "" {
			description = `<p><img src="` + escaped(poster) + `" alt="` + escaped(r.Title) + `" width="1200" height="630" /></p><p>` + escaped(r.Description) + `</p>`
			fmt.Fprintf(&b, `<media:thumbnail url="%s" width="1200" height="630"/><media:content url="%s" medium="image" type="image/png" width="1200" height="630"/>`, escaped(poster), escaped(poster))
		}
		b.WriteString("<description>" + escaped(description) + "</description>")
		for _, tag := range r.Tags {
			b.WriteString("<category>" + escaped(tag) + "</category>")
		}
		b.WriteString("</item>")
	}
	b.WriteString("</channel></rss>")
	return b.String(), nil
}

// NormalizeManagedRow applies the same privacy and search rules to the generic
// administrator data editor as to source synchronization.
func NormalizeManagedRow(row map[string]any) error {
	text := func(key string) string { v, _ := row[key].(string); return v }
	kind := text("type")
	if kind != "article" && kind != "share" && kind != "repo" && kind != "video" {
		return errors.New("内容类型无效")
	}
	href, slug := text("href"), text("slug")
	if strings.TrimSpace(text("title")) == "" || !strings.HasPrefix(href, "/") || strings.HasPrefix(href, "//") || strings.ContainsAny(href, "<>\\\x00\r\n") || slug == "" || strings.HasPrefix(slug, "/") || containsPart(slug, "..") {
		return errors.New("内容索引格式无效")
	}
	var tags, links []string
	if json.Unmarshal([]byte(text("tags")), &tags) != nil || tags == nil || json.Unmarshal([]byte(text("links")), &links) != nil || links == nil {
		return errors.New("标签和链接需要是字符串数组")
	}
	var extra map[string]any
	if json.Unmarshal([]byte(text("extra")), &extra) != nil || extra == nil {
		return errors.New("扩展信息格式无效")
	}
	encrypted := fmt.Sprint(row["encrypted"]) != "0" && fmt.Sprint(row["encrypted"]) != "false" && row["encrypted"] != nil
	if encrypted {
		row["content"] = ""
		row["description"] = ""
	}
	body, tagText := "", ""
	if !encrypted {
		body = searchBody(kind, text("content"), text("description"))
		tagText = strings.Join(tags, " ")
	}
	if kind == "article" {
		delete(extra, "tagsManaged")
	} else {
		extra["tagsManaged"] = true
	}
	row["extra"] = jsJSON(extra)
	row["search_text"] = normalize(strings.Join([]string{text("title"), body, tagText}, "\n"))
	row["revision"] = recordRevision(kind, text("title"), text("content"), text("description"), tags, links, encrypted, text("event_revision"))
	return nil
}

// Select the feed by publication time before applying its size limit.
func rssItems(records []Record) []Record {
	items := []Record{}
	for _, r := range records {
		if !r.Encrypted {
			items = append(items, r)
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		a, b := "", ""
		if items[i].Published != nil {
			a = *items[i].Published
		}
		if items[j].Published != nil {
			b = *items[j].Published
		}
		if a == b {
			return items[i].ID < items[j].ID
		}
		return a > b
	})
	if len(items) > 20 {
		items = items[:20]
	}
	return items
}

func rssTitle(r Record) string {
	prefix := map[string]string{"article": "✒️", "share": "🔗", "repo": "🍵", "video": "🎬"}[r.Type]
	if prefix == "" {
		return r.Title
	}
	return prefix + " " + r.Title
}

func rssPosterURL(origin, kind string) string {
	switch kind {
	case "article", "share", "repo", "video":
		return strings.TrimRight(origin, "/") + "/static/rss/" + kind + ".png?v=20261114-starlight"
	}
	return ""
}
