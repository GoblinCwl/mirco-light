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

func (s *Server) EnableKnowledgeMCP(token string) error {
	decoded, err := hex.DecodeString(token)
	if err != nil || len(decoded) != 32 {
		return errors.New("knowledge MCP token must contain 64 hexadecimal characters")
	}
	server := mcp.NewServer(&mcp.Implementation{Name: "microlight-index", Version: "1.1.0"}, nil)
	mcp.AddTool(server, indexTool("lookup_work", "根据 work_id 查询公开作品的索引信息、出链和反链，覆盖文章、分享、仓库、视频。found=false 表示当前公开索引中没有该作品。"), s.lookupKnowledgeWork)
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

func (s *Server) lookupKnowledgeWork(ctx context.Context, _ *mcp.CallToolRequest, input lookupWorkInput) (*mcp.CallToolResult, lookupWorkOutput, error) {
	id := strings.TrimSpace(input.WorkID)
	kind, suffix, ok := strings.Cut(id, ":")
	if !ok || !content.IsKnowledgeType(kind) || suffix == "" || len(id) > 3072 {
		return nil, lookupWorkOutput{}, errors.New("work_id 必须是完整作品 ID")
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
