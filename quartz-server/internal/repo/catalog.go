package repo

import (
	"context"
	"encoding/json"
	"fmt"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/cache"
	"goblincwl/quartz-server/internal/content"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Adapter struct {
	Owner, Root, CatalogFile string
	Origin                   func(context.Context) (string, error)
	GitHubToken              func(context.Context) (string, error)
	Social                   func(context.Context) (map[string]any, error)
	Client                   *http.Client
	Cache                    cache.Cache
}

func (a *Adapter) requestWith(ctx context.Context, target string, payload any) (json.RawMessage, error) {
	method := "GET"
	var body io.Reader
	if payload != nil {
		method = "POST"
		raw, _ := json.Marshal(payload)
		body = strings.NewReader(string(raw))
	}
	request, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "Microglow-Repo")
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	request.Header.Set("Accept", "application/json")
	if request.URL.Hostname() == "api.github.com" && a.GitHubToken != nil {
		token, err := a.GitHubToken(ctx)
		if err != nil {
			return nil, err
		}
		if token != "" {
			request.Header.Set("Authorization", "Bearer "+token)
		}
	}
	client := a.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	source := "Gitea"
	if request.URL.Hostname() == "api.github.com" {
		source = "GitHub"
	}
	response, err := alerts.Do(client, source, request)
	if err != nil {
		return nil, problem(502, "上游接口读取失败，请稍后重试")
	}
	defer response.Body.Close()
	if response.StatusCode == 404 {
		return nil, problem(404, "仓库或内容不存在")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, problem(502, "上游接口暂不可用，请稍后重试")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 16<<20+1))
	if err != nil || len(raw) > 16<<20 || !json.Valid(raw) {
		return nil, problem(502, "上游接口读取失败，请稍后重试")
	}
	return raw, nil
}
func (a *Adapter) snapshot() (map[string]any, error) {
	raw, err := os.ReadFile(a.CatalogFile)
	if err != nil {
		return nil, problem(503, "仓库目录正在同步，请稍后重试")
	}
	var snapshot map[string]any
	if json.Unmarshal(raw, &snapshot) != nil {
		return nil, problem(503, "仓库目录正在同步，请稍后重试")
	}
	return snapshot, nil
}
func (a *Adapter) Catalog(ctx context.Context) (map[string]any, error) {
	value, err := a.Cache.Get(ctx, "catalog", 30*time.Second, false, func(ctx context.Context) (map[string]any, error) {
		snapshot, err := a.snapshot()
		if err != nil {
			return nil, err
		}
		base, err := a.Origin(ctx)
		if err != nil {
			return nil, err
		}
		public := map[string]bool{}
		for page := 1; page <= 1000; page++ {
			target := strings.TrimRight(base, "/") + "/api/v1/users/" + url.PathEscape(a.Owner) + "/repos?limit=50&page=" + itoa(page)
			raw, err := a.request(ctx, target)
			if err != nil {
				return nil, err
			}
			var rows []struct {
				Name    string `json:"name"`
				Private bool   `json:"private"`
				Mirror  bool   `json:"mirror"`
			}
			if json.Unmarshal(raw, &rows) != nil || rows == nil {
				return nil, problem(502, "仓库公开状态暂不可用")
			}
			for _, row := range rows {
				if !row.Private && row.Mirror {
					public[strings.ToLower(row.Name)] = true
				}
			}
			if len(rows) < 50 {
				break
			}
		}
		rows := []map[string]any{}
		source, _ := snapshot["repositories"].([]any)
		for _, raw := range source {
			item, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			name, _ := item["name"].(string)
			if item["status"] != "ready" || !namePattern.MatchString(name) || !public[strings.ToLower(name)] {
				continue
			}
			row := map[string]any{}
			for _, key := range []string{"id", "name", "description", "language", "topics", "fork", "archived", "default_branch", "created_at", "pushed_at", "stargazers_count", "forks_count", "license"} {
				row[key] = item[key]
			}
			rows = append(rows, row)
		}
		return map[string]any{"owner": a.Owner, "updatedAt": snapshot["updatedAt"], "repositories": rows}, nil
	})
	if err != nil {
		return nil, err
	}
	if a.Social != nil {
		social, err := a.Social(ctx)
		if err != nil {
			return nil, err
		}
		value["social"] = social
	}
	return value, nil
}
func (a *Adapter) Repository(ctx context.Context, name string) (map[string]any, string, error) {
	if !namePattern.MatchString(name) || name == "." || name == ".." {
		return nil, "", problem(404, "仓库不存在")
	}
	catalog, err := a.Catalog(ctx)
	if err != nil {
		return nil, "", err
	}
	for _, item := range catalog["repositories"].([]map[string]any) {
		if strings.EqualFold(item["name"].(string), name) {
			directory, err := confined(a.Root, item["name"].(string))
			return item, directory, err
		}
	}
	return nil, "", problem(404, "仓库不存在")
}
func (a *Adapter) Content(ctx context.Context) ([]content.Item, error) {
	snapshot, err := a.snapshot()
	if err != nil {
		return nil, err
	}
	if snapshot["completedAt"] == nil || snapshot["completedAt"] == "" {
		return nil, problem(503, "仓库目录同步尚未完整完成")
	}
	// The producer atomically publishes a completed snapshot and retains each
	// failed repository's last usable ready entry. A partial pull failure must
	// not prevent successful repositories from updating their index.
	catalog, err := a.Catalog(ctx)
	if err != nil {
		return nil, err
	}
	items := []content.Item{}
	for _, row := range catalog["repositories"].([]map[string]any) {
		name := row["name"].(string)
		directory, err := confined(a.Root, name)
		if err != nil {
			return nil, err
		}
		branch := stringValue(row["default_branch"])
		if branch == "" {
			branch = "main"
		}
		sha, err := Resolve(ctx, directory, "refs/heads/"+branch)
		if err != nil {
			return nil, err
		}
		raw, _, err := Git(ctx, directory, MaxText, nil, "show", "-s", "--format=%cI", sha)
		if err != nil {
			return nil, err
		}
		id := name
		if row["id"] != nil {
			id = numberString(row["id"])
		}
		language := stringValue(row["language"])
		tags := []string{}
		if language != "" {
			tags = append(tags, language)
		}
		published := stringValue(row["created_at"])
		if published == "" {
			published = stringValue(row["pushed_at"])
		}
		readme, err := a.Cache.Get(ctx, "index-readme:"+directory+":"+sha, 24*time.Hour, false, func(ctx context.Context) (map[string]any, error) {
			tree, err := Tree(ctx, directory, sha, "")
			if err != nil {
				return nil, err
			}
			for _, entry := range tree["entries"].([]map[string]any) {
				if entry["type"] == "file" && readmeName.MatchString(entry["name"].(string)) {
					return File(ctx, directory, sha, entry["path"].(string), MaxText)
				}
			}
			return map[string]any{"content": ""}, nil
		})
		if err != nil {
			return nil, err
		}
		items = append(items, content.Item{SourceID: id, Slug: "Repo/" + name, Title: name, Content: stringValue(readme["content"]), Description: stringValue(row["description"]), Tags: tags, PublishedAt: published, UpdatedAt: strings.TrimSpace(string(raw)), EventRevision: sha, Extra: map[string]any{"language": language, "name": name, "hasReadme": stringValue(readme["path"]) != "" && strings.TrimSpace(stringValue(readme["content"])) != "" && readme["binary"] != true}})
	}
	return items, nil
}

func itoa(n int) string        { return strconv.Itoa(n) }
func stringValue(v any) string { s, _ := v.(string); return s }
func numberString(v any) string {
	switch n := v.(type) {
	case float64:
		return strconv.FormatFloat(n, 'f', -1, 64)
	default:
		return fmt.Sprint(v)
	}
}

func (a *Adapter) request(ctx context.Context, target string) (json.RawMessage, error) {
	return a.requestWith(ctx, target, nil)
}
