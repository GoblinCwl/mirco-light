package repo

import (
	"bytes"
	"context"
	"sort"
	"strings"
	"unicode/utf8"
)

func text(raw []byte) string {
	if utf8.Valid(raw) {
		return string(raw)
	}
	return strings.ToValidUTF8(string(raw), "�")
}
func Tree(ctx context.Context, directory, sha, folder string) (map[string]any, error) {
	spec := sha
	if folder != "" {
		spec += ":" + folder
	}
	raw, truncated, err := Git(ctx, directory, 4*MaxText, nil, "ls-tree", "-z", spec)
	if err != nil {
		return nil, err
	}
	entries := []map[string]any{}
	for _, entry := range bytes.Split(raw, []byte{0}) {
		parts := bytes.SplitN(entry, []byte{'\t'}, 2)
		if len(parts) != 2 {
			continue
		}
		meta := strings.Fields(string(parts[0]))
		if len(meta) != 3 {
			continue
		}
		name := text(parts[1])
		kind := "file"
		if meta[1] == "tree" {
			kind = "directory"
		} else if meta[1] == "commit" {
			kind = "submodule"
		} else if meta[0] == "120000" {
			kind = "symlink"
		}
		path := name
		if folder != "" {
			path = folder + "/" + name
		}
		entries = append(entries, map[string]any{"name": name, "path": path, "type": kind, "sha": meta[2]})
	}
	sort.SliceStable(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if (a["type"] == "directory") != (b["type"] == "directory") {
			return a["type"] == "directory"
		}
		return strings.ToLower(a["name"].(string)) < strings.ToLower(b["name"].(string))
	})
	return map[string]any{"entries": entries, "truncated": truncated, "sha": sha}, nil
}
func Directory(ctx context.Context, directory, sha, folder string) (map[string]any, error) {
	result, err := Tree(ctx, directory, sha, folder)
	if err != nil {
		return nil, err
	}
	args := []string{"log", "-z", "--no-renames", "--max-count=2000", "--format=%x00%x00%x00quartz-commit%x00%H%x00%an%x00%cI%x00%s%x00", "--name-only", sha, "--"}
	if folder != "" {
		args = append(args, ":(literal)"+folder)
	}
	history, truncated, historyErr := Git(ctx, directory, 4*MaxText, nil, args...)
	records := bytes.Split(history, []byte{0, 0, 0, 'q', 'u', 'a', 'r', 't', 'z', '-', 'c', 'o', 'm', 'm', 'i', 't', 0})
	if len(records) > 0 {
		records = records[1:]
	}
	if truncated && len(records) > 0 {
		records = records[:len(records)-1]
	}
	entries := result["entries"].([]map[string]any)
	wanted := map[string]bool{}
	for _, e := range entries {
		wanted[e["name"].(string)] = true
	}
	commits := map[string]map[string]any{}
	var latest map[string]any
	prefix := ""
	if folder != "" {
		prefix = folder + "/"
	}
	if historyErr == nil {
		for _, record := range records {
			parts := bytes.SplitN(bytes.TrimLeft(record, "\x00"), []byte{0}, 5)
			if len(parts) != 5 {
				continue
			}
			commit := map[string]any{"sha": text(parts[0]), "author": commitAuthor(text(parts[1])), "date": text(parts[2]), "subject": text(parts[3])}
			if latest == nil {
				latest = commit
			}
			names := bytes.TrimPrefix(parts[4], []byte{0, '\n'})
			for _, raw := range bytes.Split(names, []byte{0}) {
				name := text(raw)
				if !strings.HasPrefix(name, prefix) {
					continue
				}
				child := strings.SplitN(strings.TrimPrefix(name, prefix), "/", 2)[0]
				if wanted[child] && commits[child] == nil {
					commits[child] = commit
				}
			}
			if len(commits) == len(wanted) {
				break
			}
		}
	}
	for _, entry := range entries {
		entry["lastCommit"] = commits[entry["name"].(string)]
	}
	result["latestCommit"] = latest
	result["historyComplete"] = historyErr == nil && len(commits) == len(wanted)
	return result, nil
}
func File(ctx context.Context, directory, sha, path string, limit int) (map[string]any, error) {
	if path == "" {
		return nil, problem(400, "缺少文件路径")
	}
	raw, truncated, err := Git(ctx, directory, limit, nil, "cat-file", "blob", sha+":"+path)
	if err != nil {
		return nil, err
	}
	binary := bytes.ContainsRune(raw, 0)
	content := ""
	if !binary {
		content = text(raw)
	}
	return map[string]any{"content": content, "binary": binary, "truncated": truncated, "path": path, "sha": sha}, nil
}
