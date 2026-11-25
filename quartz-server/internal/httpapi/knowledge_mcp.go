package httpapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"goblincwl/quartz-server/internal/content"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const knowledgeMCPPath = "/mcp/knowledge"

type lookupWorkInput struct {
	WorkID    string `json:"work_id,omitempty" jsonschema:"索引工具返回或 Markdown 元数据中的完整 work_id"`
	SourceURL string `json:"source_url,omitempty" jsonschema:"本站作品链接或别名路径（例如 /about），与 work_id 二选一"`
}

type lookupWorkOutput struct {
	Found  bool                   `json:"found"`
	WorkID string                 `json:"work_id"`
	Work   *content.KnowledgeWork `json:"work,omitempty"`
}

type getWorkContentInput struct {
	lookupWorkInput
	Offset int `json:"offset,omitempty" jsonschema:"起始字符偏移，默认 0；使用上次返回的 next_offset 继续读取"`
	Limit  int `json:"limit,omitempty" jsonschema:"指定后只返回这一段（最多 16000 字），省略返回剩余全文"`
}

type listWorksInput struct {
	content.KnowledgeFilters
	content.KnowledgePagination
	Sort string `json:"sort,omitempty" jsonschema:"published_desc（默认）、published_asc、updated_desc、updated_asc、title_asc 或 title_desc"`
}

type searchWorksInput struct {
	content.KnowledgeFilters
	content.KnowledgePagination
	Query string `json:"query" jsonschema:"关键词（空格分隔时要求全部命中），或完整站内链接／路径（包括别名）"`
}

type listTagsInput struct {
	content.KnowledgeFilters
	content.KnowledgePagination
	Query string `json:"query,omitempty" jsonschema:"可选的标签名关键词"`
}

func indexTool(name, description string) *mcp.Tool {
	return &mcp.Tool{Name: name, Description: description, Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}
}

func (s *Server) EnableKnowledgeMCP(token, directory string) error {
	decoded, err := hex.DecodeString(token)
	if err != nil || len(decoded) != 32 {
		return errors.New("knowledge MCP token must contain 64 hexadecimal characters")
	}
	server := mcp.NewServer(&mcp.Implementation{Name: "microlight-index", Version: "1.5.0"}, nil)
	mcp.AddTool(server, indexTool("get_page_context", "查询微光集的页面。首页、视界、流光、友链及星枢可查询说明和模块。首页 contact 返回公开联系方式，流光 tags 返回标签，友链 latest_posts 返回最新友文。传入作品地址或别名时返回作品摘要、正式链接和访问状态。"), s.pageContext)
	mcp.AddTool(server, indexTool("lookup_work", "按 work_id 或站内地址查询作品的公开信息、出链及反链。别名路径（如 /about）会解析为原作品，返回标题、正式链接与 work_id。加密作品带有 requires_unlock 标记。"), s.lookupKnowledgeWork)
	mcp.AddTool(server, indexTool("get_work_content", "按 work_id 或 source_url 查询。只有无需解锁的文章提供 Markdown。requires_unlock=true 时请打开原页面解锁，工具不会返回受保护正文。指定 limit 后可用 next_offset 续读。"),
		func(ctx context.Context, _ *mcp.CallToolRequest, input getWorkContentInput) (*mcp.CallToolResult, content.KnowledgeBody, error) {
			id, sourceURL, err := input.target()
			if err != nil {
				return nil, content.KnowledgeBody{}, err
			}
			output, err := s.knowledgeIndex().GetKnowledgeBody(ctx, id, sourceURL, directory, input.Offset, input.Limit)
			return indexResult(s, output, err)
		})
	mcp.AddTool(server, indexTool("list_works", "分页列出公开索引中的作品，可按类型、标签、目录和时间筛选及排序。requires_unlock=true 的作品需在站内解锁。"), s.listKnowledgeWorks)
	mcp.AddTool(server, indexTool("search_works", "按关键词搜索公开索引，优先匹配标题。也可按站内链接或别名路径精确定位作品。加密作品带有 requires_unlock 标记。可叠加类型、标签、目录和时间筛选。"), s.searchKnowledgeWorks)
	mcp.AddTool(server, indexTool("get_statistics", "统计站内已列出的作品总数、类型和目录数量；同时给出无需解锁数和需要解锁数，可限定筛选范围。"), s.knowledgeStatistics)
	mcp.AddTool(server, indexTool("list_tags", "分页列出公开标签及关联作品总数，其中 locked_count 是需要解锁的作品数，可限定作品范围。"), s.listKnowledgeTags)

	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server },
		&mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	want := sha256.Sum256([]byte(token))
	s.knowledgeMCP = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		value, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		key := sha256.Sum256([]byte(value))
		if !ok || subtle.ConstantTimeCompare(key[:], want[:]) != 1 {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if r.ContentLength > 32<<10 {
			http.Error(w, "request too large", http.StatusRequestEntityTooLarge)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		handler.ServeHTTP(w, r.WithContext(ctx))
	})
	return nil
}

func (input lookupWorkInput) target() (string, string, error) {
	id := strings.TrimSpace(input.WorkID)
	sourceURL := strings.TrimSpace(input.SourceURL)
	if (id == "") == (sourceURL == "") {
		return "", "", errors.New("请填写 work_id 或 source_url，二选一")
	}
	if id == "" {
		return "", sourceURL, nil
	}
	kind, suffix, ok := strings.Cut(id, ":")
	if !ok || !content.IsKnowledgeType(kind) || suffix == "" || len(id) > 3072 {
		return "", "", errors.New("work_id 必须是完整作品 ID")
	}
	return id, "", nil
}

func (s *Server) lookupKnowledgeWork(ctx context.Context, _ *mcp.CallToolRequest, input lookupWorkInput) (*mcp.CallToolResult, lookupWorkOutput, error) {
	id, sourceURL, err := input.target()
	if err != nil {
		return nil, lookupWorkOutput{}, err
	}
	work, err := s.knowledgeIndex().LookupKnowledgeWork(ctx, id, sourceURL)
	if work != nil {
		id = work.WorkID
	}
	return indexResult(s, lookupWorkOutput{Found: work != nil, WorkID: id, Work: work}, err)
}

func (s *Server) knowledgeIndex() content.Store {
	return content.Store{DB: s.DB, Origin: s.Origin}
}

func (s *Server) listKnowledgeWorks(ctx context.Context, _ *mcp.CallToolRequest, input listWorksInput) (*mcp.CallToolResult, content.KnowledgePage[content.KnowledgeSummary], error) {
	output, err := s.knowledgeIndex().ListKnowledgeWorks(ctx, input.KnowledgeFilters, input.KnowledgePagination, input.Sort)
	return indexResult(s, output, err)
}

func (s *Server) searchKnowledgeWorks(ctx context.Context, _ *mcp.CallToolRequest, input searchWorksInput) (*mcp.CallToolResult, content.KnowledgePage[content.KnowledgeSummary], error) {
	output, err := s.knowledgeIndex().SearchKnowledgeWorks(ctx, input.KnowledgeFilters, input.KnowledgePagination, input.Query)
	return indexResult(s, output, err)
}

func (s *Server) knowledgeStatistics(ctx context.Context, _ *mcp.CallToolRequest, filters content.KnowledgeFilters) (*mcp.CallToolResult, content.KnowledgeStatistics, error) {
	output, err := s.knowledgeIndex().GetKnowledgeStatistics(ctx, filters)
	return indexResult(s, output, err)
}

func (s *Server) listKnowledgeTags(ctx context.Context, _ *mcp.CallToolRequest, input listTagsInput) (*mcp.CallToolResult, content.KnowledgePage[content.KnowledgeTag], error) {
	output, err := s.knowledgeIndex().ListKnowledgeTags(ctx, input.KnowledgeFilters, input.KnowledgePagination, input.Query)
	return indexResult(s, output, err)
}

func indexResult[T any](s *Server, output T, err error) (*mcp.CallToolResult, T, error) {
	if err != nil {
		if errors.Is(err, content.ErrKnowledgeQuery) {
			return nil, output, err
		}
		s.Log.Error("knowledge MCP query failed", "error", err)
		return nil, output, errors.New("索引查询暂时不可用")
	}
	return nil, output, nil
}
