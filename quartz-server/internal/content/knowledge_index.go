package content

import (
	"cmp"
	"context"
	"errors"
	"path"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

type KnowledgeFilters struct {
	Type           string `json:"type,omitempty" jsonschema:"作品类型 article、share、repo 或 video，省略为全部"`
	Tag            string `json:"tag,omitempty" jsonschema:"完整标签名，支持带 # 前缀"`
	Directory      string `json:"directory,omitempty" jsonschema:"索引目录路径，例如 Memo/Obsidian，包含子目录；/ 只匹配根目录"`
	From           string `json:"from,omitempty" jsonschema:"起始时间，接受 YYYY-MM-DD 或 RFC3339，包含该时间"`
	To             string `json:"to,omitempty" jsonschema:"结束时间，接受 YYYY-MM-DD 或 RFC3339，包含该时间；日期包含整天"`
	DateField      string `json:"date_field,omitempty" jsonschema:"时间筛选字段 published 或 updated，默认 published；日期按北京时间"`
	RequiresUnlock *bool  `json:"requires_unlock,omitempty" jsonschema:"true 只查询需要解锁的作品，false 只查询无需解锁的作品；省略包含两类"`
}

type KnowledgePagination struct {
	Page     int `json:"page,omitempty" jsonschema:"页码，默认 1"`
	PageSize int `json:"page_size,omitempty" jsonschema:"每页条数，默认 20，最多 50"`
}

type KnowledgePage[T any] struct {
	Items    []T  `json:"items"`
	Total    int  `json:"total"`
	Page     int  `json:"page"`
	PageSize int  `json:"page_size"`
	HasMore  bool `json:"has_more"`
}

type KnowledgeDirectoryCount struct {
	Directory   string `json:"directory"`
	Count       int    `json:"count"`
	LockedCount int    `json:"locked_count"`
}

type KnowledgeStatistics struct {
	Total         int                       `json:"total"`
	UnlockedTotal int                       `json:"unlocked_total"`
	LockedTotal   int                       `json:"locked_total"`
	ByType        map[string]int            `json:"by_type"`
	LockedByType  map[string]int            `json:"locked_by_type"`
	ByDirectory   []KnowledgeDirectoryCount `json:"by_directory"`
}

type KnowledgeTag struct {
	Tag         string `json:"tag"`
	Count       int    `json:"count"`
	LockedCount int    `json:"locked_count"`
}

var ErrKnowledgeQuery = errors.New("invalid knowledge index query")

func IsKnowledgeType(kind string) bool {
	return kind == "article" || kind == "share" || kind == "repo" || kind == "video"
}

func knowledgeDirectory(slug string) string {
	if directory := path.Dir(slug); directory != "." {
		return directory
	}
	return "/"
}

// Use the same normalized index text as site search and return only metadata.
func (s Store) knowledgeRecords(ctx context.Context, kind string, terms []string) ([]Record, error) {
	conditions := make([]string, 0, len(terms)+1)
	args := make([]any, 0, len(terms)+1)
	if kind != "" {
		conditions = append(conditions, "type=?")
		args = append(args, kind)
	}
	for _, term := range terms {
		conditions = append(conditions, "(encrypted=1 OR LOCATE(?, search_text COLLATE utf8mb4_bin)>0)")
		args = append(args, term)
	}
	where := ""
	if len(conditions) > 0 {
		where = " WHERE " + strings.Join(conditions, " AND ")
	}
	records, err := selectRecords(ctx, s.DB, true, where, args)
	if err != nil || len(terms) == 0 {
		return records, err
	}
	// Even if an older index row still contains search text, only the visible
	// title may match a search for a locked article.
	return slices.DeleteFunc(records, func(record Record) bool {
		if !record.Encrypted {
			return false
		}
		title := normalize(record.Title)
		return slices.ContainsFunc(terms, func(term string) bool {
			return !strings.Contains(title, term)
		})
	}), nil
}

func knowledgeDate(value string, end bool) (time.Time, bool, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false, nil
	}
	if day, err := time.ParseInLocation(time.DateOnly, value, time.FixedZone("CST", 8*60*60)); err == nil {
		if end {
			return day.AddDate(0, 0, 1), true, nil
		}
		return day, false, nil
	}
	at, err := time.Parse(time.RFC3339Nano, value)
	return at, false, err
}

func (f KnowledgeFilters) predicate() (func(Record) bool, error) {
	f.Type = strings.TrimSpace(f.Type)
	if f.Type != "" && !IsKnowledgeType(f.Type) {
		return nil, errors.Join(ErrKnowledgeQuery, errors.New("type 需为 article、share、repo 或 video"))
	}
	if f.DateField != "" && f.DateField != "published" && f.DateField != "updated" {
		return nil, errors.Join(ErrKnowledgeQuery, errors.New("date_field 需为 published 或 updated"))
	}
	from, _, fromErr := knowledgeDate(f.From, false)
	to, exclusive, toErr := knowledgeDate(f.To, true)
	if fromErr != nil || toErr != nil || !from.IsZero() && !to.IsZero() && (to.Before(from) || exclusive && to.Equal(from)) {
		return nil, errors.Join(ErrKnowledgeQuery, errors.New("时间范围无效，使用 YYYY-MM-DD 或 RFC3339"))
	}
	directory := strings.TrimSpace(f.Directory)
	if directory != "/" {
		directory = strings.Trim(directory, "/")
	}
	tag := normalize(strings.TrimPrefix(strings.TrimSpace(f.Tag), "#"))
	return func(record Record) bool {
		if f.Type != "" && record.Type != f.Type {
			return false
		}
		if f.RequiresUnlock != nil && record.Encrypted != *f.RequiresUnlock {
			return false
		}
		if directory != "" {
			current := knowledgeDirectory(record.Slug)
			if current != directory && !strings.HasPrefix(current, directory+"/") {
				return false
			}
		}
		if tag != "" && !slices.ContainsFunc(record.Tags, func(value string) bool { return normalize(value) == tag }) {
			return false
		}
		if from.IsZero() && to.IsZero() {
			return true
		}
		date := record.Published
		if f.DateField == "updated" {
			date = record.Updated
		}
		if date == nil {
			return false
		}
		at, err := time.Parse(time.RFC3339Nano, *date)
		return err == nil && (from.IsZero() || !at.Before(from)) &&
			(to.IsZero() || at.Before(to) || !exclusive && at.Equal(to))
	}, nil
}

func (s Store) filterKnowledge(ctx context.Context, filters KnowledgeFilters, terms []string) ([]Record, error) {
	match, err := filters.predicate()
	if err != nil {
		return nil, err
	}
	records, err := s.knowledgeRecords(ctx, strings.TrimSpace(filters.Type), terms)
	if err != nil {
		return nil, err
	}
	return slices.DeleteFunc(records, func(record Record) bool { return !match(record) }), nil
}

func normalizeKnowledgePagination(p KnowledgePagination) (KnowledgePagination, error) {
	if p.Page < 0 || p.Page > 1000000 || p.PageSize < 0 || p.PageSize > 50 {
		return p, errors.Join(ErrKnowledgeQuery, errors.New("page 需为正整数，page_size 最大为 50"))
	}
	if p.Page == 0 {
		p.Page = 1
	}
	if p.PageSize == 0 {
		p.PageSize = 20
	}
	return p, nil
}

func knowledgePage[T any](items []T, p KnowledgePagination) KnowledgePage[T] {
	start := min((p.Page-1)*p.PageSize, len(items))
	end := min(start+p.PageSize, len(items))
	return KnowledgePage[T]{Items: items[start:end], Total: len(items), Page: p.Page, PageSize: p.PageSize, HasMore: end < len(items)}
}

func knowledgeSort(order string) (func(Record, Record) int, error) {
	switch order {
	case "", "published_desc", "published_asc", "updated_desc", "updated_asc", "title_asc", "title_desc":
	default:
		return nil, errors.Join(ErrKnowledgeQuery, errors.New("sort 无效"))
	}
	asc := strings.HasSuffix(order, "_asc")
	return func(a, b Record) int {
		var result int
		if strings.HasPrefix(order, "title_") {
			result = cmp.Compare(normalize(a.Title), normalize(b.Title))
		} else {
			left, right := a.Published, b.Published
			if strings.HasPrefix(order, "updated_") {
				left, right = a.Updated, b.Updated
			}
			if left == nil && right != nil {
				return 1
			}
			if left != nil && right == nil {
				return -1
			}
			if left != nil && right != nil {
				result = cmp.Compare(*left, *right)
			}
		}
		if result == 0 {
			return cmp.Compare(a.ID, b.ID)
		}
		if asc {
			return result
		}
		return -result
	}, nil
}

func (s Store) ListKnowledgeWorks(ctx context.Context, filters KnowledgeFilters, page KnowledgePagination, order string) (KnowledgePage[KnowledgeSummary], error) {
	return s.queryKnowledgeWorks(ctx, filters, page, order, nil)
}

func (s Store) SearchKnowledgeWorks(ctx context.Context, filters KnowledgeFilters, page KnowledgePagination, query string) (KnowledgePage[KnowledgeSummary], error) {
	query = strings.TrimSpace(query)
	if strings.HasPrefix(query, "/") || strings.HasPrefix(query, "https://") || strings.HasPrefix(query, "http://") {
		page, err := normalizeKnowledgePagination(page)
		if err != nil {
			return KnowledgePage[KnowledgeSummary]{}, err
		}
		match, err := filters.predicate()
		if err != nil {
			return KnowledgePage[KnowledgeSummary]{}, err
		}
		record, err := s.knowledgeWorkRecord(ctx, "", query)
		if err != nil {
			return KnowledgePage[KnowledgeSummary]{}, err
		}
		items := []KnowledgeSummary{}
		if record != nil && match(*record) {
			items = append(items, knowledgeSummary(*record, s.Origin))
		}
		return knowledgePage(items, page), nil
	}
	terms := strings.Fields(normalize(query))
	if len(terms) == 0 || len(terms) > 20 || utf8.RuneCountInString(query) > 200 {
		return KnowledgePage[KnowledgeSummary]{}, errors.Join(ErrKnowledgeQuery, errors.New("query 需为 1 至 200 字且最多 20 个关键词"))
	}
	return s.queryKnowledgeWorks(ctx, filters, page, "", terms)
}

func (s Store) queryKnowledgeWorks(ctx context.Context, filters KnowledgeFilters, page KnowledgePagination, order string, terms []string) (KnowledgePage[KnowledgeSummary], error) {
	page, err := normalizeKnowledgePagination(page)
	if err != nil {
		return KnowledgePage[KnowledgeSummary]{}, err
	}
	orderBy, err := knowledgeSort(order)
	if err != nil {
		return KnowledgePage[KnowledgeSummary]{}, err
	}
	records, err := s.filterKnowledge(ctx, filters, terms)
	if err != nil {
		return KnowledgePage[KnowledgeSummary]{}, err
	}
	phrase := strings.Join(terms, " ")
	titleScore := func(record Record) int {
		title := normalize(record.Title)
		if phrase != "" && strings.Contains(title, phrase) {
			return 1 + len(terms)
		}
		score := 0
		for _, term := range terms {
			if strings.Contains(title, term) {
				score++
			}
		}
		return score
	}
	slices.SortFunc(records, func(a, b Record) int {
		if score := cmp.Compare(titleScore(b), titleScore(a)); score != 0 {
			return score
		}
		return orderBy(a, b)
	})
	paged := knowledgePage(records, page)
	items := make([]KnowledgeSummary, 0, len(paged.Items))
	for _, record := range paged.Items {
		items = append(items, knowledgeSummary(record, s.Origin))
	}
	return KnowledgePage[KnowledgeSummary]{items, paged.Total, paged.Page, paged.PageSize, paged.HasMore}, nil
}

func (s Store) GetKnowledgeStatistics(ctx context.Context, filters KnowledgeFilters) (KnowledgeStatistics, error) {
	records, err := s.filterKnowledge(ctx, filters, nil)
	if err != nil {
		return KnowledgeStatistics{}, err
	}
	result := KnowledgeStatistics{
		Total: len(records), ByType: map[string]int{"article": 0, "share": 0, "repo": 0, "video": 0},
		LockedByType: map[string]int{"article": 0, "share": 0, "repo": 0, "video": 0}, ByDirectory: []KnowledgeDirectoryCount{},
	}
	directories := map[string]KnowledgeDirectoryCount{}
	for _, record := range records {
		result.ByType[record.Type]++
		directory := knowledgeDirectory(record.Slug)
		count := directories[directory]
		count.Directory = directory
		count.Count++
		if record.Encrypted {
			result.LockedTotal++
			result.LockedByType[record.Type]++
			count.LockedCount++
		}
		directories[directory] = count
	}
	result.UnlockedTotal = result.Total - result.LockedTotal
	for _, count := range directories {
		result.ByDirectory = append(result.ByDirectory, count)
	}
	slices.SortFunc(result.ByDirectory, func(a, b KnowledgeDirectoryCount) int { return cmp.Compare(a.Directory, b.Directory) })
	return result, nil
}

func (s Store) ListKnowledgeTags(ctx context.Context, filters KnowledgeFilters, page KnowledgePagination, query string) (KnowledgePage[KnowledgeTag], error) {
	page, err := normalizeKnowledgePagination(page)
	if err != nil {
		return KnowledgePage[KnowledgeTag]{}, err
	}
	records, err := s.filterKnowledge(ctx, filters, nil)
	if err != nil {
		return KnowledgePage[KnowledgeTag]{}, err
	}
	query = normalize(strings.TrimPrefix(strings.TrimSpace(query), "#"))
	counts := map[string]KnowledgeTag{}
	for _, record := range records {
		for _, tag := range unique(record.Tags) {
			if strings.Contains(normalize(tag), query) {
				count := counts[tag]
				count.Tag = tag
				count.Count++
				if record.Encrypted {
					count.LockedCount++
				}
				counts[tag] = count
			}
		}
	}
	items := make([]KnowledgeTag, 0, len(counts))
	for _, count := range counts {
		items = append(items, count)
	}
	slices.SortFunc(items, func(a, b KnowledgeTag) int {
		if a.Count != b.Count {
			return cmp.Compare(b.Count, a.Count)
		}
		return cmp.Compare(a.Tag, b.Tag)
	})
	return knowledgePage(items, page), nil
}
