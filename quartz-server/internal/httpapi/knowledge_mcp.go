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
	WorkID string `json:"work_id" jsonschema:"索引工具返回或 Markdown 元数据中的完整 work_id"`
}

type lookupWorkOutput struct {
	Found  bool                   `json:"found"`
	WorkID string                 `json:"work_id"`
	Work   *content.KnowledgeWork `json:"work,omitempty"`
}

type getWorkContentInput struct {
	WorkID    string `json:"work_id,omitempty" jsonschema:"从搜索结果或知识库元数据取得的文章 ID"`
	SourceURL string `json:"source_url,omitempty" jsonschema:"本站文章链接，也可传站内路径；与 work_id 二选一"`
	Offset    int    `json:"offset,omitempty" jsonschema:"起始字符偏移，默认 0；使用上次返回的 next_offset 继续读取"`
	Limit     int    `json:"limit,omitempty" jsonschema:"指定后只返回这一段（最多 16000 字），省略返回剩余全文"`
}

type listWorksInput struct {
	content.KnowledgeFilters
	content.KnowledgePagination
	Sort string `json:"sort,omitempty" jsonschema:"published_desc（默认）、published_asc、updated_desc、updated_asc、title_asc 或 title_desc"`
}

type searchWorksInput struct {
	content.KnowledgeFilters
	content.KnowledgePagination
	Query string `json:"query" jsonschema:"关键词，空格分隔时要求全部命中"`
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
	server := mcp.NewServer(&mcp.Implementation{Name: "microlight-index", Version: "1.3.0"}, nil)
	mcp.AddTool(server, indexTool("get_page_context", "查询微光集的首页、视界、流光（标签页）、友链或星枢公开页面。传页面名或站内地址获取说明和模块清单。查询数据时指定模块，例如流光的 tags 标签列表、works 标签作品，或友链的 latest_posts。"), s.pageContext)
	mcp.AddTool(server, indexTool("lookup_work", "根据 work_id 查询公开作品的索引信息、出链和反链，覆盖文章、分享、仓库、视频。found=false 表示当前公开索引中没有该作品。"), s.lookupKnowledgeWork)
	mcp.AddTool(server, indexTool("get_work_content", "读取公开文章构建时导出的原始 Markdown 文件，含元数据及正文。已知文章链接时传 source_url，知道标题或关键词时先用 search_works 查 work_id。指定 limit 后可用 next_offset 续读。"),
		func(ctx context.Context, _ *mcp.CallToolRequest, input getWorkContentInput) (*mcp.CallToolResult, content.KnowledgeBody, error) {
			id, sourceURL := strings.TrimSpace(input.WorkID), strings.TrimSpace(input.SourceURL)
			if (id == "") == (sourceURL == "") {
				return nil, content.KnowledgeBody{}, errors.New("请填写 work_id 或 source_url，二选一")
			}
			if id != "" {
				if _, err := (lookupWorkInput{WorkID: id}).validatedID(); err != nil {
					return nil, content.KnowledgeBody{}, err
				}
			}
			output, err := s.knowledgeIndex().GetKnowledgeBody(ctx, id, sourceURL, directory, input.Offset, input.Limit)
			return indexResult(s, output, err)
		})
	mcp.AddTool(server, indexTool("list_works", "分页列出公开作品，可按类型、标签、目录和时间筛选及排序。"), s.listKnowledgeWorks)
	mcp.AddTool(server, indexTool("search_works", "根据关键词搜索公开作品，优先返回标题命中结果。可叠加类型、标签、目录和时间筛选。"), s.searchKnowledgeWorks)
	mcp.AddTool(server, indexTool("get_statistics", "统计公开作品总数、各类型数量及各索引目录数量，可限定筛选范围。"), s.knowledgeStatistics)
	mcp.AddTool(server, indexTool("list_tags", "分页列出公开作品的标签及作品数，按作品数降序，可限定作品范围。"), s.listKnowledgeTags)

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

func (input lookupWorkInput) validatedID() (string, error) {
	id := strings.TrimSpace(input.WorkID)
	kind, suffix, ok := strings.Cut(id, ":")
	if !ok || !content.IsKnowledgeType(kind) || suffix == "" || len(id) > 3072 {
		return "", errors.New("work_id 必须是完整作品 ID")
	}
	return id, nil
}

func (s *Server) lookupKnowledgeWork(ctx context.Context, _ *mcp.CallToolRequest, input lookupWorkInput) (*mcp.CallToolResult, lookupWorkOutput, error) {
	id, err := input.validatedID()
	if err != nil {
		return nil, lookupWorkOutput{}, err
	}
	work, err := s.knowledgeIndex().LookupKnowledgeWork(ctx, id)
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
