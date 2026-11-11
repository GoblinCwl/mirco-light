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
	Store  Store
	Path   string
	mu     sync.Mutex
	digest [32]byte
	loaded bool
}

func (s *ArticleSnapshot) Import(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, err := os.ReadFile(s.Path)
	if err != nil {
		return err
	}
	digest := sha256.Sum256(raw)
	if s.loaded && digest == s.digest {
		return nil
	}
	var snapshot struct {
		Articles []Item `json:"articles"`
	}
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return err
	}
	if snapshot.Articles == nil {
		return errors.New("article snapshot incomplete; keeping previous index")
	}
	if err := s.Store.Sync(ctx, "article", snapshot.Articles); err != nil {
		return err
	}
	s.digest, s.loaded = digest, true
	return nil
}
