package journal

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"time"
)

type BuildState struct {
	Sources map[string]struct {
		Hash string `json:"hash"`
	} `json:"sources"`
	CompletedAt string `json:"completedAt"`
}

func ParseBuildState(raw []byte) (BuildState, error) {
	var state BuildState
	if err := json.Unmarshal(raw, &state); err != nil {
		return state, err
	}
	if state.Sources == nil || state.CompletedAt == "" {
		return state, errors.New("incomplete build snapshot")
	}
	if _, err := time.Parse(time.RFC3339Nano, state.CompletedAt); err != nil {
		return state, err
	}
	for _, source := range state.Sources {
		if len(source.Hash) != 64 {
			return state, errors.New("invalid build source digest")
		}
		if _, err := hex.DecodeString(source.Hash); err != nil {
			return state, err
		}
	}
	return state, nil
}
func ChangedSources(before, after BuildState) int {
	changed := 0
	for path, source := range before.Sources {
		if next, ok := after.Sources[path]; !ok || next.Hash != source.Hash {
			changed++
		}
	}
	for path := range after.Sources {
		if _, ok := before.Sources[path]; !ok {
			changed++
		}
	}
	return changed
}
func (s Store) ImportBuild(ctx context.Context, raw []byte) error {
	state, err := ParseBuildState(raw)
	if err != nil {
		return err
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// The row always exists before it is locked, avoiding concurrent first-insert
	// upgrade deadlocks. This state contains no public page or user information.
	_, err = tx.ExecContext(ctx, "INSERT INTO runtime_state(name,value,updated_at) VALUES('build-baseline','',?) ON DUPLICATE KEY UPDATE name=VALUES(name)", state.CompletedAt)
	if err != nil {
		return err
	}
	var previous string
	if err = tx.QueryRowContext(ctx, "SELECT value FROM runtime_state WHERE name='build-baseline' FOR UPDATE").Scan(&previous); err != nil {
		return err
	}
	if previous != "" {
		before, err := ParseBuildState([]byte(previous))
		if err != nil {
			return err
		}
		if before.CompletedAt == state.CompletedAt {
			return tx.Commit()
		}
		if state.CompletedAt < before.CompletedAt {
			return nil
		}
		if count := ChangedSources(before, state); count > 0 {
			hash := sha256.Sum256(raw)
			if err = Append(ctx, tx, "site", map[string]any{"count": count}, state.CompletedAt, "build:"+hex.EncodeToString(hash[:])); err != nil {
				return err
			}
		}
	}
	normalized, err := json.Marshal(state)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE runtime_state SET value=?,updated_at=? WHERE name='build-baseline'", string(normalized), state.CompletedAt); err != nil {
		return err
	}
	return tx.Commit()
}
func (s Store) BuildFile(ctx context.Context, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return s.ImportBuild(ctx, raw)
}
