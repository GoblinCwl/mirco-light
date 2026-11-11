package comments

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"sync"
	"time"
)

type Permissions struct {
	DB                 *sql.DB
	Client             *Client
	SnapshotPath, Site string
	mu                 sync.Mutex
}

// Refresh consumes the successful private build snapshot, never public assets.
// Successful pages are checkpointed even if a later upstream operation fails.
func (p *Permissions) Refresh(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	raw, err := os.ReadFile(p.SnapshotPath)
	if err != nil {
		return err
	}
	var snapshot struct {
		Permissions []Permission `json:"permissions"`
	}
	if err = json.Unmarshal(raw, &snapshot); err != nil {
		return err
	}
	if snapshot.Permissions == nil {
		return nil
	} // pre-cutover article snapshots
	base, credentials, _, err := p.Client.configuration(ctx)
	if err != nil {
		return err
	}
	var stored string
	err = p.DB.QueryRowContext(ctx, "SELECT value FROM runtime_state WHERE name='comment-permissions'").Scan(&stored)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	before := map[string]string{}
	if stored != "" {
		if err = json.Unmarshal([]byte(stored), &before); err != nil {
			return err
		}
	}
	after := map[string]string{}
	for _, setting := range snapshot.Permissions {
		if setting.Key == "" {
			return errors.New("invalid comment permission key")
		}
		if _, exists := after[setting.Key]; exists {
			return errors.New("duplicate comment permission key")
		}
		after[setting.Key] = ""
	}
	changed := false
	var failed error
	for _, setting := range snapshot.Permissions {
		encoded, _ := json.Marshal([]any{setting, p.Site, base, credentials["email"]})
		hash := sha256.Sum256(encoded)
		digest := hex.EncodeToString(hash[:])
		if before[setting.Key] == digest {
			after[setting.Key] = digest
			continue
		}
		if err = p.Client.Permission(ctx, p.Site, setting); err != nil {
			failed = err
			break
		}
		after[setting.Key] = digest
		changed = true
	}
	// Keep unprocessed successful checkpoints on an upstream failure. Removed
	// pages disappear only from this private checkpoint, never from Artalk.
	if failed != nil {
		for key, value := range before {
			if after[key] == "" {
				after[key] = value
			}
		}
	}
	if changed || failed == nil {
		value, _ := json.Marshal(after)
		if string(value) == stored {
			return failed
		}
		_, err = p.DB.ExecContext(ctx, "INSERT INTO runtime_state(name,value,updated_at) VALUES('comment-permissions',?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_at=VALUES(updated_at)", string(value), time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
		if err != nil {
			return err
		}
	}
	return failed
}
