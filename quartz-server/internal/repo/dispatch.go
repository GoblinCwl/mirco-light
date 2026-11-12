package repo

import (
	"bytes"
	"context"
	"encoding/json"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

var readmeName = regexp.MustCompile(`(?i)^readme(?:\.(?:md|markdown|mdown|txt|rst))?$`)

func (a *Adapter) Dispatch(ctx context.Context, name, action string, query url.Values) (map[string]any, error) {
	item, directory, err := a.Repository(ctx, name)
	if err != nil {
		return nil, err
	}
	ref := query.Get("ref")
	if ref == "" {
		ref = stringValue(item["default_branch"])
		if ref == "" {
			ref = "HEAD"
		}
	}
	sha, err := Resolve(ctx, directory, ref)
	if err != nil {
		return nil, err
	}
	filename, err := SafePath(query.Get("path"))
	if err != nil {
		return nil, err
	}
	page := 1
	if raw := query.Get("page"); raw != "" {
		page, err = strconv.Atoi(raw)
		if err != nil {
			return nil, problem(400, "无效的页码")
		}
	}
	if page < 1 {
		page = 1
	}
	if page > 1000 {
		page = 1000
	}
	switch action {
	case "languages":
		return a.Languages(ctx, stringValue(item["name"]))
	case "info":
		raw, _, err := Git(ctx, directory, MaxText, nil, "for-each-ref", "--format=%(refname)", "refs/heads", "refs/tags")
		if err != nil {
			return nil, err
		}
		branches, tags := []string{}, []string{}
		for _, ref := range strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n") {
			if strings.HasPrefix(ref, "refs/heads/") {
				branches = append(branches, strings.TrimPrefix(ref, "refs/heads/"))
			} else if strings.HasPrefix(ref, "refs/tags/") {
				tags = append(tags, strings.TrimPrefix(ref, "refs/tags/"))
			}
		}
		value := map[string]any{}
		for key, v := range item {
			value[key] = v
		}
		value["sha"] = sha
		value["owner"] = a.Owner
		value["branches"] = branches
		value["tags"] = tags
		value["githubUrl"] = "https://github.com/" + url.PathEscape(a.Owner) + "/" + url.PathEscape(stringValue(item["name"]))
		return value, nil
	case "tree":
		return Tree(ctx, directory, sha, filename)
	case "browse":
		kind := "directory"
		if filename != "" {
			raw, _, err := Git(ctx, directory, 50, nil, "cat-file", "-t", sha+":"+filename)
			if err != nil {
				return nil, err
			}
			switch strings.TrimSpace(string(raw)) {
			case "tree":
			case "commit":
				return map[string]any{"type": "submodule"}, nil
			default:
				kind = "file"
			}
		}
		if kind == "file" {
			result, err := File(ctx, directory, sha, filename, MaxText)
			if err != nil {
				return nil, err
			}
			result["type"] = "file"
			return result, nil
		}
		key := "directory:" + directory + ":" + sha + ":" + filename
		result, err := a.Cache.Get(ctx, key, time.Hour, false, func(ctx context.Context) (map[string]any, error) { return Directory(ctx, directory, sha, filename) })
		if err != nil && result == nil {
			return nil, err
		}
		result["type"] = "directory"
		return result, nil
	case "file":
		return File(ctx, directory, sha, filename, MaxText)
	case "readme":
		tree, err := Tree(ctx, directory, sha, filename)
		if err != nil {
			return nil, err
		}
		for _, entry := range tree["entries"].([]map[string]any) {
			if entry["type"] == "file" && readmeName.MatchString(entry["name"].(string)) {
				return File(ctx, directory, sha, entry["path"].(string), MaxText)
			}
		}
		return map[string]any{"content": "", "path": "", "sha": sha}, nil
	case "files":
		raw, truncated, err := Git(ctx, directory, 4*MaxText, nil, "ls-tree", "-r", "-z", "--name-only", sha)
		if err != nil {
			return nil, err
		}
		files := []string{}
		if len(raw) > 0 {
			files = strings.Split(strings.TrimRight(text(raw), "\x00"), "\x00")
		}
		return map[string]any{"files": files, "truncated": truncated, "sha": sha}, nil
	case "search":
		term := strings.TrimSpace(query.Get("q"))
		if term == "" || utf8.RuneCountInString(term) > 200 {
			return nil, problem(400, "请输入 1–200 字的搜索内容")
		}
		raw, truncated, err := Git(ctx, directory, MaxText, []int{0, 1}, "grep", "-n", "-z", "-I", "-i", "-F", "-m", "3", "-e", term, sha, "--")
		if err != nil {
			return nil, err
		}
		results := []map[string]any{}
		for _, line := range bytes.Split(raw, []byte{'\n'}) {
			parts := bytes.SplitN(line, []byte{0}, 3)
			if len(parts) != 3 {
				continue
			}
			number, err := strconv.Atoi(string(parts[1]))
			if err != nil {
				continue
			}
			body := []rune(text(parts[2]))
			if len(body) > 1000 {
				body = body[:1000]
			}
			results = append(results, map[string]any{"path": strings.TrimPrefix(text(parts[0]), sha+":"), "line": number, "text": string(body)})
			if len(results) == 100 {
				truncated = true
				break
			}
		}
		return map[string]any{"results": results, "truncated": truncated, "sha": sha}, nil
	case "commits":
		raw, _, err := Git(ctx, directory, MaxText, nil, "log", "-z", "--format=%H%x00%an%x00%aI%x00%s", "--max-count=31", "--skip="+itoa((page-1)*30), sha, "--")
		if err != nil {
			return nil, err
		}
		fields := strings.Split(strings.TrimRight(text(raw), "\x00"), "\x00")
		commits := []map[string]any{}
		for i := 0; i+3 < len(fields); i += 4 {
			commits = append(commits, commit(fields[i:i+4]))
		}
		more := len(commits) > 30
		if more {
			commits = commits[:30]
		}
		var focused map[string]any
		if selected := query.Get("commit"); selected != "" {
			selected, err = Resolve(ctx, directory, selected)
			if err != nil {
				return nil, err
			}
			found := false
			for _, c := range commits {
				if c["sha"] == selected {
					found = true
				}
			}
			if !found {
				raw, _, err := Git(ctx, directory, MaxText, nil, "show", "-s", "-z", "--format=%H%x00%an%x00%cI%x00%s", selected)
				if err != nil {
					return nil, err
				}
				fields := strings.Split(text(raw), "\x00")
				if len(fields) >= 4 {
					focused = commit(fields[:4])
				}
			}
		}
		return map[string]any{"commits": commits, "hasMore": more, "focusedCommit": focused}, nil
	case "diff":
		head := query.Get("head")
		if head == "" {
			head = sha
		}
		head, err = Resolve(ctx, directory, head)
		if err != nil {
			return nil, err
		}
		var args []string
		if base := query.Get("base"); base != "" {
			base, err = Resolve(ctx, directory, base)
			if err != nil {
				return nil, err
			}
			args = []string{"diff", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", base, head, "--"}
		} else {
			args = []string{"show", "--format=", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", head, "--"}
		}
		raw, truncated, err := Git(ctx, directory, MaxText, nil, args...)
		if err != nil {
			return nil, err
		}
		return map[string]any{"diff": text(raw), "truncated": truncated}, nil
	case "releases":
		return a.Releases(ctx, stringValue(item["name"]), page)
	default:
		return nil, problem(404, "接口不存在")
	}
}
func commit(fields []string) map[string]any {
	return map[string]any{"sha": fields[0], "author": commitAuthor(fields[1]), "date": fields[2], "subject": fields[3]}
}
func (a *Adapter) Releases(ctx context.Context, name string, page int) (map[string]any, error) {
	return a.Cache.Get(ctx, "releases:"+name+":"+itoa(page), 10*time.Minute, true, func(ctx context.Context) (map[string]any, error) {
		raw, err := a.request(ctx, "https://api.github.com/repos/"+url.PathEscape(a.Owner)+"/"+url.PathEscape(name)+"/releases?per_page=20&page="+itoa(page))
		if err != nil {
			return nil, err
		}
		var source []map[string]any
		if json.Unmarshal(raw, &source) != nil || source == nil {
			return nil, problem(502, "版本数据暂不可用")
		}
		releases := []map[string]any{}
		for _, row := range source {
			if row["draft"] == true {
				continue
			}
			assets := []map[string]any{}
			if files, ok := row["assets"].([]any); ok {
				for _, raw := range files {
					file, ok := raw.(map[string]any)
					if !ok {
						continue
					}
					assets = append(assets, map[string]any{"name": file["name"], "size": file["size"], "url": file["browser_download_url"], "downloads": file["download_count"]})
				}
			}
			name := stringValue(row["name"])
			if name == "" {
				name = stringValue(row["tag_name"])
			}
			releases = append(releases, map[string]any{"name": name, "tag": row["tag_name"], "body": stringValue(row["body"]), "publishedAt": row["published_at"], "prerelease": row["prerelease"], "url": row["html_url"], "sourceZip": row["zipball_url"], "assets": assets})
		}
		return map[string]any{"releases": releases, "hasMore": len(source) == 20, "stale": false}, nil
	})
}

// Public display identity only; original Git objects and signatures stay intact.
func commitAuthor(name string) string {
	if name == "陈威龙" {
		return "GoblinCwl"
	}
	return name
}
