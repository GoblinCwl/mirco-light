package httpapi

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/content"
	"goblincwl/quartz-server/internal/journal"
	"goblincwl/quartz-server/internal/settings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type pageContextInput struct {
	Page           string `json:"page" jsonschema:"页面名称、站内路径或完整站内链接，例如 友链 或 /friends/"`
	Section        string `json:"section,omitempty" jsonschema:"模块 ID；省略时只返回页面说明和模块清单"`
	Limit          int    `json:"limit,omitempty" jsonschema:"每页条数，默认 5，最多 20"`
	PageNumber     int    `json:"page_number,omitempty" jsonschema:"页码，默认 1；按 next_page 继续查询"`
	Type           string `json:"type,omitempty" jsonschema:"视界和流光的作品类型筛选，article、share、repo 或 video"`
	RequiresUnlock *bool  `json:"requires_unlock,omitempty" jsonschema:"仅用于作品和标签列表；true 只看需要解锁的作品，false 只看无需解锁的作品"`
	Tag            string `json:"tag,omitempty" jsonschema:"仅用于流光；tags 模块按标签名搜索；works 模块要求完整标签名，省略时使用页面 URL 中的 tag"`
	Month          string `json:"month,omitempty" jsonschema:"仅用于星历，YYYY-MM，默认北京时间当月"`
}

type pageSection struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Live        bool   `json:"live"`
}

type specialPage struct {
	Path        string        `json:"path"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Sections    []pageSection `json:"sections"`
}

type pageContextOutput struct {
	Found    bool                      `json:"found"`
	Page     *specialPage              `json:"page,omitempty"`
	Section  *pageSection              `json:"section,omitempty"`
	Items    any                       `json:"items,omitempty"`
	NextPage int                       `json:"next_page,omitempty"`
	Month    string                    `json:"month,omitempty"`
	Tag      string                    `json:"tag,omitempty"`
	Contact  *pageContact              `json:"contact,omitempty"`
	Work     *content.KnowledgeSummary `json:"work,omitempty"`
}

var specialPages = []specialPage{
	{"/", "首页", "微光集的入口，提供内容导览、近期更新和站主的日常记录。", []pageSection{
		{"contact", "站主联系方式", "查询首页公开显示的站主昵称、联系邮箱和 QQ 号。", true},
		{"discover", "拾遗", "从文章、分享、仓库、视频随机挑选作品；刷新可更换，访客屏幕上的结果以当次展示为准。", false},
		{"recent", "流新", "最近更新的公开作品。", true},
		{"calendar", "星历", "按月浏览日历。可查询指定月份的公开特殊日日期与名称。", true},
		{"compass", "罗盘", "显示站主的分类活动时长。", false},
	}},
	{"/reading/", "视界", "按时间浏览文章、分享、仓库、视频。可按类型筛选，也可使用年月时间轴浏览。", []pageSection{
		{"works", "作品列表", "按更新时间倒序查询公开作品，可用 type 筛选。按关键词或时间范围查找可用 search_works 或 list_works。", true},
	}},
	{"/tags/", "流光", "按标签浏览四类作品。选中标签后可查看该标签下的作品。", []pageSection{
		{"tags", "标签列表", "查询公开标签及其关联作品数量，可按标签名称搜索。", true},
		{"works", "标签作品", "查询指定标签下的公开作品。可传 tag 或使用页面地址里的 tag。", true},
	}},
	{"/friends/", "友链", "查看微光集收录的站点、阅读友文或申请交换友链。", []pageSection{
		{"friend_list", "友链列表", "查询当前展示的站点名称、简介和链接。", true},
		{"latest_posts", "最新友文", "查询从友链 RSS 拉取的最新文章，按发布时间倒序。", true},
		{"apply", "申请友链", "在页面的「申请友链」填写网站名称、简介、网址、头像地址和包含本站友链的页面地址。邮箱和 RSS 地址可选。", false},
	}},
	{"/observatory/", "星枢", "公开观测微光集的运行状态，展示资源趋势、服务状态和运行纪事，并提供问题反馈入口。", []pageSection{
		{"services", "服务状态", "查询公开展示的服务及当前运行状态。", true},
		{"journal", "运行纪事", "查询近期内容更新、站点更新及服务恢复的时间与摘要。", true},
		{"feedback", "问题反馈", "可通过页面上的问题反馈表单提交使用问题。", false},
	}},
}

func (s *Server) resolveSpecialPage(value string) (*specialPage, string) {
	value = strings.TrimSpace(value)
	if value == "标签" || value == "标签页" {
		value = "流光"
	}
	for i := range specialPages {
		if specialPages[i].Name == value {
			return &specialPages[i], ""
		}
	}
	target, err := url.Parse(value)
	if err != nil || target.User != nil || !strings.HasPrefix(target.Path, "/") || strings.HasPrefix(value, "//") {
		return nil, ""
	}
	if target.IsAbs() {
		origin, err := url.Parse(s.Origin)
		if err != nil || !strings.EqualFold(target.Host, origin.Host) || target.Scheme != origin.Scheme {
			return nil, ""
		}
	}
	path := strings.TrimSuffix(strings.TrimRight(target.Path, "/"), "/index.html")
	path = strings.TrimSuffix(path, ".html")
	for i := range specialPages {
		if strings.TrimRight(specialPages[i].Path, "/") == path {
			if path == "/tags" {
				return &specialPages[i], strings.TrimSpace(target.Query().Get("tag"))
			}
			return &specialPages[i], ""
		}
	}
	return nil, ""
}

func pageQueryError(message string) error {
	return errors.Join(content.ErrKnowledgeQuery, errors.New(message))
}

func (s *Server) pageContext(ctx context.Context, _ *mcp.CallToolRequest, input pageContextInput) (*mcp.CallToolResult, pageContextOutput, error) {
	page, selectedTag := s.resolveSpecialPage(input.Page)
	if page == nil {
		address := strings.TrimSpace(input.Page)
		if strings.HasPrefix(address, "/") || strings.HasPrefix(address, "https://") || strings.HasPrefix(address, "http://") {
			work, err := s.knowledgeIndex().LookupKnowledgeWork(ctx, "", address)
			if err != nil && !errors.Is(err, content.ErrKnowledgeQuery) {
				return indexResult(s, pageContextOutput{}, err)
			}
			if work != nil {
				return nil, pageContextOutput{Found: true, Work: &work.KnowledgeSummary}, nil
			}
		}
		return nil, pageContextOutput{}, nil
	}
	result := pageContextOutput{Found: true, Page: page, Tag: selectedTag}
	if input.Limit < 0 || input.Limit > 20 || input.PageNumber < 0 || input.PageNumber > 100 {
		return indexResult(s, result, pageQueryError("limit 范围为 1–20，page_number 范围为 1–100"))
	}
	if input.Limit == 0 {
		input.Limit = 5
	}
	input.PageNumber = max(1, input.PageNumber)
	if input.Section == "" {
		return nil, result, nil
	}
	for i := range page.Sections {
		if page.Sections[i].ID == input.Section {
			result.Section = &page.Sections[i]
			break
		}
	}
	if result.Section == nil {
		return indexResult(s, result, pageQueryError("模块不存在，请先查询该页面的模块列表"))
	}
	if page.Path == "/tags/" {
		input.Tag = strings.TrimSpace(input.Tag)
		if input.Tag == "" && input.Section == "works" {
			input.Tag = selectedTag
		}
		if len(input.Tag) > 600 {
			return indexResult(s, result, pageQueryError("标签名称过长"))
		}
	}
	err := s.loadPageSection(ctx, input, &result)
	return indexResult(s, result, err)
}

func (s *Server) loadPageSection(ctx context.Context, input pageContextInput, result *pageContextOutput) error {
	offset := (input.PageNumber - 1) * input.Limit
	switch input.Section {
	case "contact":
		values, err := (settings.Store{DB: s.DB}).Read(ctx, true)
		if err != nil {
			return err
		}
		name, _ := values["profile.name"].(string)
		email, _ := values["profile.email"].(string)
		qq, _ := values["profile.qq"].(string)
		result.Contact = &pageContact{Name: name, Email: email, QQ: qq}
	case "tags":
		tags, err := s.knowledgeIndex().ListKnowledgeTags(ctx, content.KnowledgeFilters{Type: input.Type, RequiresUnlock: input.RequiresUnlock},
			content.KnowledgePagination{Page: input.PageNumber, PageSize: input.Limit}, input.Tag)
		result.Items = tags.Items
		if tags.HasMore && input.PageNumber < 100 {
			result.NextPage = input.PageNumber + 1
		}
		return err
	case "works", "recent":
		filters := content.KnowledgeFilters{Type: input.Type, RequiresUnlock: input.RequiresUnlock}
		if result.Page.Path == "/tags/" {
			filters.Tag = strings.TrimSpace(strings.TrimPrefix(input.Tag, "#"))
			if filters.Tag == "" {
				return pageQueryError("请指定要查询作品的标签")
			}
			result.Tag = filters.Tag
		}
		works, err := s.knowledgeIndex().ListKnowledgeWorks(ctx, filters,
			content.KnowledgePagination{Page: input.PageNumber, PageSize: input.Limit}, "updated_desc")
		result.Items = works.Items
		if works.HasMore && input.PageNumber < 100 {
			result.NextPage = input.PageNumber + 1
		}
		return err
	case "friend_list":
		friends, err := (community.Store{DB: s.DB}).Friends(ctx, true)
		items := make([]pageFriend, 0, len(friends))
		for _, friend := range friends {
			if !friend.Example {
				items = append(items, pageFriend{friend.Number, friend.Name, friend.URL, friend.Description})
			}
		}
		setPageItems(result, input, items, offset)
		return err
	case "latest_posts":
		posts, err := (community.Store{DB: s.DB}).FriendArticlePage(ctx, input.Limit+1, offset)
		items := make([]pageFriendPost, 0, len(posts))
		for _, post := range posts {
			items = append(items, pageFriendPost{post.Title, post.URL, post.Source, post.PublishedAt})
		}
		setPageItems(result, input, items, 0)
		return err
	case "calendar":
		if s.Adapters == nil {
			return pageQueryError("星历数据暂不可用")
		}
		month := input.Month
		if month == "" {
			month = time.Now().In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01")
		}
		if parsed, err := time.Parse("2006-01", month); err != nil || parsed.Year() < 1 || parsed.Format("2006-01") != month {
			return pageQueryError("月份格式必须为 YYYY-MM")
		}
		snapshot, err := s.Adapters.Attendance(ctx, month)
		if err != nil {
			return err
		}
		result.Month = month
		records, _ := snapshot["records"].([]any)
		items := []pageCalendarDay{}
		for _, value := range records {
			record, _ := value.(map[string]any)
			date, _ := record["date"].(string)
			name, _ := record["specialName"].(string)
			if date != "" && name != "" {
				items = append(items, pageCalendarDay{date, name})
			}
		}
		setPageItems(result, input, items, offset)
	case "services":
		if s.Monitoring == nil {
			return pageQueryError("服务状态暂不可用")
		}
		services, err := s.Monitoring.Services(ctx)
		items := make([]pageService, 0, len(services))
		for _, service := range services {
			items = append(items, pageService{service.Name, service.State})
		}
		setPageItems(result, input, items, offset)
		return err
	case "journal":
		events, err := (journal.Store{DB: s.DB}).Read(ctx)
		items := make([]pageJournalEntry, 0, len(events))
		for _, event := range events {
			item := pageJournalEntry{Kind: event.Kind, CompletedAt: event.CompletedAt}
			if event.Kind == "service" {
				item.Service, _ = event.Payload["service"].(string)
			} else if count, ok := event.Payload["count"].(float64); ok {
				item.Count = int(count)
			}
			items = append(items, item)
		}
		setPageItems(result, input, items, offset)
		return err
	}
	return nil
}

func setPageItems[T any](result *pageContextOutput, input pageContextInput, items []T, offset int) {
	start := min(offset, len(items))
	end := min(start+input.Limit, len(items))
	result.Items = items[start:end]
	if end < len(items) && input.PageNumber < 100 {
		result.NextPage = input.PageNumber + 1
	}
}

type pageContact struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
	QQ    string `json:"qq,omitempty"`
}

type pageFriend struct {
	Number      int64  `json:"number"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description"`
}

type pageFriendPost struct {
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Source      string    `json:"source"`
	PublishedAt time.Time `json:"published_at"`
}

type pageCalendarDay struct {
	Date string `json:"date"`
	Name string `json:"name"`
}

type pageService struct {
	Name  string `json:"name"`
	State string `json:"state"`
}

type pageJournalEntry struct {
	Kind        string `json:"kind"`
	CompletedAt string `json:"completed_at"`
	Service     string `json:"service,omitempty"`
	Count       int    `json:"count,omitempty"`
}
