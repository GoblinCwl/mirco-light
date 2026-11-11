package openlist

import (
	"context"
	"database/sql"
	"encoding/json"
	"goblincwl/quartz-server/internal/content"
	"html"
	_ "modernc.org/sqlite"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type Adapter struct{ DB *sql.DB }
type Entry struct {
	Kind        string   `json:"kind"`
	ID          string   `json:"id,omitempty"`
	Name        string   `json:"name,omitempty"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Protected   bool     `json:"protected,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	SharedAt    string   `json:"sharedAt,omitempty"`
	Order       *int64   `json:"order,omitempty"`
	Comment     bool     `json:"comment,omitempty"`
	Jellyfin    *bool    `json:"jellyfin,omitempty"`
}

func Open(path string) (*Adapter, error) {
	u := url.URL{Scheme: "file", Path: path}
	q := u.Query()
	q.Set("mode", "ro")
	q.Add("_pragma", "busy_timeout=3000")
	u.RawQuery = q.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err = db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return &Adapter{DB: db}, nil
}

var shareID = regexp.MustCompile(`^[\p{L}\p{N}\p{M}_-]{1,64}$`)
var blocks = regexp.MustCompile(`(?is)<(?:script|style)\b[^>]*>.*?</(?:script|style)>`)
var htmlTags = regexp.MustCompile(`<[^>]*>`)
var headings = regexp.MustCompile(`(?is)<h[1-3]\b[^>]*>(.*?)</h[1-3]>`)
var mdHeading = regexp.MustCompile(`(?m)^#{1,3}\s+(.+)$`)

func guestDescription(header, readme string) string {
	source := header
	if source == "" {
		source = readme
	}
	heading := headings.FindStringSubmatch(source)
	title := "公开文件与资料"
	if len(heading) > 1 {
		title = heading[1]
	} else if heading = mdHeading.FindStringSubmatch(source); len(heading) > 1 {
		title = heading[1]
	}
	title = html.UnescapeString(htmlTags.ReplaceAllString(blocks.ReplaceAllString(title, ""), ""))
	title = strings.Join(strings.Fields(title), " ")
	r := []rune(title)
	if len(r) > 120 {
		r = r[:120]
	}
	return string(r)
}
func (a *Adapter) Entries(ctx context.Context) ([]Entry, error) {
	entries := []Entry{}
	var base string
	var disabled bool
	err := a.DB.QueryRowContext(ctx, "SELECT base_path,disabled FROM x_users WHERE role=1 LIMIT 1").Scan(&base, &disabled)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == nil && !disabled {
		var header, readme sql.NullString
		err = a.DB.QueryRowContext(ctx, "SELECT header,readme FROM x_meta WHERE path=?", base).Scan(&header, &readme)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		entries = append(entries, Entry{Kind: "guest", Title: "访客空间", Description: guestDescription(header.String, readme.String)})
	}
	rows, err := a.DB.QueryContext(ctx, "SELECT s.id,s.files_raw,s.expires,s.pwd != '' AS protected,s.accessed,s.max_accessed,s.remark FROM x_sharing_dbs s JOIN x_users u ON u.id=s.creator_id WHERE s.disabled=0 AND u.disabled=0 AND (u.permission & 16384)!=0")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, files string
		var expires, remark sql.NullString
		var protected bool
		var accessed, max int64
		if err = rows.Scan(&id, &files, &expires, &protected, &accessed, &max, &remark); err != nil {
			return nil, err
		}
		if !shareID.MatchString(id) || max > 0 && accessed >= max {
			continue
		}
		if expires.Valid && expires.String != "" {
			if expiry, err := time.Parse(time.RFC3339Nano, expires.String); err == nil && !expiry.After(time.Now()) {
				continue
			}
		}
		var paths []string
		if json.Unmarshal([]byte(files), &paths) != nil || len(paths) == 0 {
			continue
		}
		metadata, _ := ParseMetadata(remark.String, false)
		entries = append(entries, Entry{Kind: "share", ID: id, Name: id, Title: id, Protected: protected, Tags: metadata.Tags, SharedAt: metadata.SharedAt, Order: metadata.Order, Comment: metadata.Comment, Jellyfin: metadata.Jellyfin})
	}
	return entries, rows.Err()
}
func (a *Adapter) Content(ctx context.Context) ([]content.Item, error) {
	entries, err := a.Entries(ctx)
	if err != nil {
		return nil, err
	}
	items := []content.Item{}
	for _, entry := range entries {
		if entry.Kind != "share" {
			continue
		}
		jellyfin := entry.Jellyfin != nil && *entry.Jellyfin
		items = append(items, content.Item{SourceID: entry.ID, Slug: "Share/分享/" + entry.ID, Title: entry.Title, Tags: entry.Tags, Encrypted: entry.Protected, PublishedAt: entry.SharedAt, Extra: map[string]any{"jellyfin": jellyfin}})
	}
	return items, nil
}

func (e Entry) MarshalJSON() ([]byte, error) {
	value := map[string]any{"kind": e.Kind, "title": e.Title}
	if e.Kind == "guest" {
		value["description"] = e.Description
		return json.Marshal(value)
	}
	tags := e.Tags
	if tags == nil {
		tags = []string{}
	}
	value["id"] = e.ID
	value["name"] = e.Name
	value["protected"] = e.Protected
	value["tags"] = tags
	value["comment"] = e.Comment
	if e.SharedAt != "" {
		value["sharedAt"] = e.SharedAt
	}
	if e.Order != nil {
		value["order"] = *e.Order
	}
	if e.Jellyfin != nil {
		value["jellyfin"] = *e.Jellyfin
	}
	return json.Marshal(value)
}
