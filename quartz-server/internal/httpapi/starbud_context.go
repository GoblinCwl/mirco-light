package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"goblincwl/quartz-server/internal/starbud"
)

type starbudReadTurn struct {
	user, ip string
	mu       sync.Mutex
	pending  map[string]bool
}

func (t *starbudReadTurn) register(event starbud.StreamEvent) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.pending) >= 4 || len(event.RequestID) != 32 || len(event.Query) > 600 || len(event.FileRef) > 64 || event.Cursor < 0 {
		return false
	}
	if _, exists := t.pending[event.RequestID]; exists {
		return false
	}
	switch event.Action {
	case "find_text", "list_files", "read_file":
		t.pending[event.RequestID] = true
		return true
	}
	return false
}

func (t *starbudReadTurn) claim(requestID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if !t.pending[requestID] {
		return false
	}
	t.pending[requestID] = false
	return true
}

func (s *Server) starbudUnlockMatches(ctx context.Context, input starbud.Input) bool {
	if s.DB == nil || input.Unlock.WorkID == "" || len(input.Unlock.WorkID) > 512 {
		return false
	}
	page, err := url.Parse(input.PageURL)
	if err != nil {
		return false
	}
	lookup := input.PageURL
	parts := strings.Split(strings.Trim(page.Path, "/"), "/")
	if len(parts) >= 3 && parts[0] == "Share" && parts[1] == "分享" {
		for _, part := range parts {
			if part == "" || part == "." || part == ".." || strings.Contains(part, "\\") {
				return false
			}
		}
		lookup = (&url.URL{Path: "/" + strings.Join(parts[:3], "/") + "/"}).String()
	}
	work, err := s.knowledgeIndex().LookupKnowledgeWork(ctx, "", lookup)
	return err == nil && work != nil && work.RequiresUnlock && work.WorkID == input.Unlock.WorkID &&
		(work.Type == "article" || work.Type == "share")
}

func (s *Server) submitStarbudContext(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != s.Origin || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	user, ip := s.starbudIdentity(w, r)
	if user == "" {
		return
	}
	var input starbud.ContextResult
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	var result map[string]json.RawMessage
	if body(w, r, &input) != nil || len(input.TurnID) != 26 || len(input.RequestID) != 32 ||
		len(input.Result) > 28<<10 || json.Unmarshal(input.Result, &result) != nil || result == nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	value, exists := s.starbudReads.Load(input.TurnID)
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	turn := value.(*starbudReadTurn)
	if turn.user != user || turn.ip != ip || !turn.claim(input.RequestID) {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if s.Starbud.SubmitContext(r.Context(), input) != nil {
		w.WriteHeader(http.StatusBadGateway)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
