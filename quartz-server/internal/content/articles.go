package content

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"os"
	"sync"
)

// ArticleSnapshot is consumed on startup and successful-build notifications.
// Failed imports never advance the checkpoint; duplicate deliveries skip SQL.
type ArticleSnapshot struct {
	Store              Store
	Path               string
	KnowledgeDirectory string
	mu                 sync.Mutex
	digest             [32]byte
	loaded             bool
}

func (s *ArticleSnapshot) Import(ctx context.Context) error {
	_, err := s.ImportChanged(ctx)
	return err
}

// ImportChanged lets dependent relation updates run only after a new successful snapshot.
func (s *ArticleSnapshot) ImportChanged(ctx context.Context) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, err := os.ReadFile(s.Path)
	if err != nil {
		return false, err
	}
	digest := sha256.Sum256(raw)
	if s.loaded && digest == s.digest {
		return false, nil
	}
	var snapshot struct {
		Articles  []Item             `json:"articles"`
		Knowledge []knowledgeArticle `json:"knowledge"`
	}
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return false, err
	}
	if snapshot.Articles == nil {
		return false, errors.New("article snapshot incomplete; keeping previous index")
	}
	export := s.KnowledgeDirectory != "" && snapshot.Knowledge != nil
	if export {
		if err := validateKnowledge(snapshot.Articles, snapshot.Knowledge); err != nil {
			return false, err
		}
	}
	if err := s.Store.Sync(ctx, "article", snapshot.Articles); err != nil {
		return false, err
	}
	if export {
		if err := s.publishKnowledge(ctx, snapshot.Knowledge); err != nil {
			return false, err
		}
	}
	s.digest, s.loaded = digest, true
	return true, nil
}
