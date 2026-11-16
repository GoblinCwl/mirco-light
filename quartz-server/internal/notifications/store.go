package notifications

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"goblincwl/quartz-server/internal/secretbox"
	"strings"
	"time"
)

type Event struct {
	Version    int    `json:"version"`
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	RecordID   string `json:"recordId"`
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	Status     string `json:"status"`
	Level      string `json:"level,omitempty"`
	OccurredAt string `json:"occurredAt"`
}
type Store struct {
	DB  *sql.DB
	Key []byte
}

func summary(s string) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > 500 {
		return string(r[:500]) + "…"
	}
	return string(r)
}

// EnqueueTx is part of the business transaction; disabled channels do not backfill history.
func EnqueueTx(ctx context.Context, tx *sql.Tx, e Event) error {
	if e.Kind != "alerts" && e.Kind != "feedback" && e.Kind != "friends" {
		return errors.New("通知类型无效")
	}
	var raw string
	if err := tx.QueryRowContext(ctx, "SELECT value FROM settings WHERE `key`='notify.astrbot.enabled'").Scan(&raw); err == sql.ErrNoRows {
		return nil
	} else if err != nil {
		return err
	}
	if raw != "true" {
		return nil
	}
	err := tx.QueryRowContext(ctx, "SELECT value FROM settings WHERE `key`=?", "notify.astrbot."+e.Kind).Scan(&raw)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if err == nil && raw == "false" {
		return nil
	}
	if e.Kind == "alerts" && e.Level == "warning" {
		err = tx.QueryRowContext(ctx, "SELECT value FROM settings WHERE `key`='notify.astrbot.minLevel'").Scan(&raw)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		if err == nil && raw == `"error"` {
			return nil
		}
	}
	e.Version = 1
	e.ID = uuid.NewString()
	e.Summary = summary(e.Summary)
	e.OccurredAt = time.Now().UTC().Format(time.RFC3339Nano)
	payload, err := json.Marshal(e)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "INSERT INTO notification_outbox(id,kind,record_id,payload,available_at,created_at) VALUES(?,?,?,?,?,?)", e.ID, e.Kind, e.RecordID, string(payload), time.Now().UnixMilli(), e.OccurredAt)
	return err
}
func (s Store) Token(ctx context.Context) (string, error) {
	var raw string
	err := s.DB.QueryRowContext(ctx, "SELECT envelope FROM notification_tokens WHERE id=1").Scan(&raw)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var box secretbox.Envelope
	if err = json.Unmarshal([]byte(raw), &box); err != nil {
		return "", err
	}
	return secretbox.Open(box, s.Key, []byte("microlight:astrbot:token"))
}
func (s Store) Rotate(ctx context.Context) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := "ml_" + base64.RawURLEncoding.EncodeToString(b)
	box, err := secretbox.Seal(token, s.Key, []byte("microlight:astrbot:token"))
	if err != nil {
		return "", err
	}
	raw, _ := json.Marshal(box)
	_, err = s.DB.ExecContext(ctx, "INSERT INTO notification_tokens(id,envelope,created_at) VALUES(1,?,?) ON DUPLICATE KEY UPDATE envelope=VALUES(envelope),created_at=VALUES(created_at)", string(raw), time.Now().UTC().Format(time.RFC3339Nano))
	return token, err
}
func (s Store) TokenInfo(ctx context.Context) (map[string]any, error) {
	result := map[string]any{"configured": false, "createdAt": ""}
	var stamp string
	err := s.DB.QueryRowContext(ctx, "SELECT created_at FROM notification_tokens WHERE id=1").Scan(&stamp)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == nil {
		result["configured"] = true
		result["createdAt"] = stamp
	}
	return result, nil
}
func (s Store) Describe(ctx context.Context) (map[string]any, error) {
	result, err := s.TokenInfo(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.DB.QueryContext(ctx, "SELECT id,kind,record_id,state,attempts,created_at,last_error FROM notification_outbox ORDER BY created_at DESC,id DESC LIMIT 30")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, kind, record, state, at, last string
		var attempts int
		if err = rows.Scan(&id, &kind, &record, &state, &attempts, &at, &last); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{"id": id, "kind": kind, "recordId": record, "state": state, "attempts": attempts, "createdAt": at, "error": last})
	}
	result["items"] = items
	return result, rows.Err()
}
func (s Store) Retry(ctx context.Context, id string) error {
	r, err := s.DB.ExecContext(ctx, "UPDATE notification_outbox SET state='pending',attempts=0,available_at=?,last_error='' WHERE id=? AND state IN ('pending','failed')", time.Now().UnixMilli(), id)
	if err != nil {
		return err
	}
	n, _ := r.RowsAffected()
	if n == 0 {
		return errors.New("没有可重试的通知")
	}
	return nil
}
