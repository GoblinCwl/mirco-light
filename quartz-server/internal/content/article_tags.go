package content

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	guuid "github.com/google/uuid"
	"gopkg.in/yaml.v3"
)

// Serializes this process's tag writes. External editors are checked again
// immediately before replacement; no long-lived copy of a note is written back.
var articleTagWrites sync.Mutex

type articleChange struct {
	root          *os.Root
	path          string
	before, after []byte
	mode          os.FileMode
}

func (s Store) openArticle(r Record) (*articleChange, error) {
	if s.ArticleDirectory == "" {
		return nil, errors.New("未配置笔记目录，无法修改文章标签")
	}
	path, _ := r.Extra["filePath"].(string)
	if !filepath.IsLocal(path) || filepath.Ext(path) != ".md" {
		return nil, errors.New("文章原始文件路径无效")
	}
	root, err := os.OpenRoot(s.ArticleDirectory)
	if err != nil {
		return nil, fmt.Errorf("无法访问笔记目录: %w", err)
	}
	fail := func(err error) (*articleChange, error) { root.Close(); return nil, err }
	info, err := root.Lstat(path)
	if err != nil {
		return fail(fmt.Errorf("无法读取笔记文件: %w", err))
	}
	if !info.Mode().IsRegular() {
		return fail(errors.New("笔记必须是普通 Markdown 文件"))
	}
	raw, err := root.ReadFile(path)
	if err != nil {
		return fail(err)
	}
	return &articleChange{root: root, path: path, before: raw, mode: info.Mode().Perm()}, nil
}

func (s Store) articleTags(r Record) ([]string, error) {
	change, err := s.openArticle(r)
	if err != nil {
		return nil, err
	}
	defer change.root.Close()
	_, tags, err := markdownTags(change.before, nil)
	return tags, err
}

func (s Store) prepareArticle(r Record, values []string, reset bool) (Record, *articleChange, error) {
	return s.prepareArticleTransform(r, func(current []string) ([]string, error) {
		if reset {
			return current, nil
		}
		return tagsNormalized(values)
	})
}
func (s Store) prepareArticleTransform(r Record, transform func([]string) ([]string, error)) (Record, *articleChange, error) {
	change, err := s.openArticle(r)
	if err != nil {
		return r, nil, err
	}
	fail := func(err error) (Record, *articleChange, error) { change.root.Close(); return r, nil, err }
	_, current, err := markdownTags(change.before, nil)
	if err != nil {
		return fail(err)
	}
	tags, err := transform(current)
	if err != nil {
		return fail(err)
	}
	if slices.Equal(current, tags) {
		change.after = change.before
		r.Tags = tags
	} else {
		change.after, r.Tags, err = markdownTags(change.before, tags)
	}
	if err != nil {
		return fail(err)
	}
	r.Extra = map[string]any{"sourceTags": r.Tags}
	return r, change, nil
}

func (c *articleChange) replace(expected, replacement []byte) error {
	if bytes.Equal(expected, replacement) {
		return nil
	}
	info, err := c.root.Lstat(c.path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("笔记文件类型已改变，请刷新后重试")
	}
	current, err := c.root.ReadFile(c.path)
	if err != nil {
		return err
	}
	if !bytes.Equal(expected, current) {
		return errors.New("笔记已被其他程序修改，请刷新后重试")
	}
	temporary := filepath.Join(filepath.Dir(c.path), ".quartz-tags-"+guuid.NewString()+".tmp")
	file, err := c.root.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, c.mode)
	if err != nil {
		return err
	}
	defer c.root.Remove(temporary)
	_, writeErr := file.Write(replacement)
	if writeErr == nil {
		writeErr = file.Chmod(c.mode)
	}
	if writeErr == nil {
		writeErr = file.Sync()
	}
	if err = file.Close(); writeErr == nil {
		writeErr = err
	}
	if writeErr != nil {
		return writeErr
	}
	// Check after the temporary write too, so slow disk I/O cannot overwrite a newer edit.
	current, err = c.root.ReadFile(c.path)
	if err != nil {
		return err
	}
	latest, err := c.root.Lstat(c.path)
	if err != nil {
		return err
	}
	if !os.SameFile(info, latest) || !bytes.Equal(expected, current) {
		return errors.New("笔记已被其他程序修改，请刷新后重试")
	}
	return c.root.Rename(temporary, c.path)
}

func applyArticles(changes []*articleChange) (func() error, error) {
	completed := []*articleChange{}
	rollback := func() error {
		var err error
		for _, c := range slices.Backward(completed) {
			err = errors.Join(err, c.replace(c.after, c.before))
		}
		return err
	}
	for _, c := range changes {
		if err := c.replace(c.before, c.after); err != nil {
			return nil, errors.Join(err, rollback())
		}
		completed = append(completed, c)
	}
	return rollback, nil
}

// Only tag property lines are replaced. Other YAML, comments, body, BOM and
// line endings remain byte-for-byte intact. nil means read without changing.
func markdownTags(raw []byte, desired []string) ([]byte, []string, error) {
	bom := []byte{}
	text := string(raw)
	if strings.HasPrefix(text, "\ufeff") {
		bom = []byte("\ufeff")
		text = strings.TrimPrefix(text, "\ufeff")
	}
	lines := strings.SplitAfter(text, "\n")
	eol := "\n"
	if strings.HasSuffix(lines[0], "\r\n") {
		eol = "\r\n"
	}
	end := -1
	if strings.TrimSpace(lines[0]) == "---" {
		for i := 1; i < len(lines); i++ {
			if strings.TrimSpace(lines[i]) == "---" {
				end = i
				break
			}
		}
		if end < 0 {
			return nil, nil, errors.New("笔记 YAML 属性没有结束分隔线")
		}
	}
	if end < 0 {
		if desired == nil {
			return raw, []string{}, nil
		}
		prefix := "---" + eol + tagProperty("tags", desired, eol) + "---" + eol
		return append(bom, []byte(prefix+text)...), desired, nil
	}
	header := strings.Join(lines[1:end], "")
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(header), &doc); err != nil {
		return nil, nil, fmt.Errorf("笔记 YAML 属性无效: %w", err)
	}
	tags := []string{}
	type span struct {
		start, end int
		key        string
	}
	spans := []span{}
	if len(doc.Content) > 0 {
		mapping := doc.Content[0]
		if mapping.Kind != yaml.MappingNode || mapping.Style&yaml.FlowStyle != 0 {
			return nil, nil, errors.New("笔记属性需要使用普通 YAML 键值格式")
		}
		var selected *yaml.Node
		for i := 0; i < len(mapping.Content); i += 2 {
			key, value := mapping.Content[i], mapping.Content[i+1]
			if key.Value != "tags" && key.Value != "tag" {
				continue
			}
			if key.Column != 1 {
				return nil, nil, errors.New("标签属性缩进无效")
			}
			if selected == nil || selected.Tag == "!!null" || key.Value == "tags" && value.Tag != "!!null" {
				selected = value
			}
			stop := end - 1
			if i+2 < len(mapping.Content) {
				stop = mapping.Content[i+2].Line - 1
			}
			// Preserve blank lines and comments belonging to the following property.
			for stop > key.Line && (strings.TrimSpace(lines[stop]) == "" || strings.HasPrefix(strings.TrimSpace(lines[stop]), "#")) {
				stop--
			}
			spans = append(spans, span{key.Line, stop + 1, key.Value})
		}
		if selected != nil {
			var value any
			if err := selected.Decode(&value); err != nil {
				return nil, nil, err
			}
			switch v := value.(type) {
			case []any:
				for _, entry := range v {
					switch entry.(type) {
					case string, int, int64, uint64, float64:
						tags = append(tags, fmt.Sprint(entry))
					}
				}
			case nil:
			default:
				for _, entry := range strings.Split(fmt.Sprint(v), ",") {
					tags = append(tags, strings.TrimSpace(entry))
				}
			}
			tags = sourceTagsNormalized(tags)
		}
	}
	if desired == nil {
		return raw, tags, nil
	}
	// Apply bottom-up so YAML line numbers remain valid for every property.
	for _, span := range slices.Backward(spans) {
		lines = append(lines[:span.start], append([]string{tagProperty(span.key, desired, eol)}, lines[span.end:]...)...)
	}
	if len(spans) == 0 {
		lines = append(lines[:end], append([]string{tagProperty("tags", desired, eol)}, lines[end:]...)...)
	}
	updated := append(bom, []byte(strings.Join(lines, ""))...)
	// Reparse after patching: anchors used elsewhere must never be silently broken.
	if _, _, err := markdownTags(updated, nil); err != nil {
		return nil, nil, err
	}
	return updated, desired, nil
}

func tagProperty(key string, tags []string, eol string) string {
	if len(tags) == 0 {
		return key + ": []" + eol
	}
	text := key + ":" + eol
	for _, tag := range tags {
		quoted, _ := json.Marshal(tag)
		text += "  - " + string(quoted) + eol
	}
	return text
}
