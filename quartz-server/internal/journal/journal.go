package journal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

type Store struct{ DB *sql.DB }
type Event struct {
	ID          int64          `json:"id"`
	Kind        string         `json:"kind"`
	CompletedAt string         `json:"completedAt"`
	Payload     map[string]any `json:"payload"`
}

func (s Store) Read(ctx context.Context) ([]Event, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT id,kind,completed_at,payload FROM journal ORDER BY completed_at DESC,id DESC LIMIT 10")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := []Event{}
	for rows.Next() {
		var e Event
		var raw string
		if err = rows.Scan(&e.ID, &e.Kind, &e.CompletedAt, &raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &e.Payload); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}
func Append(ctx context.Context, tx *sql.Tx, kind string, payload map[string]any, completed, sourceKey string) error {
	if kind != "content" && kind != "site" && kind != "service" {
		return errors.New("纪事类型无效")
	}
	if payload == nil {
		return errors.New("纪事内容无效")
	}
	if completed == "" {
		completed = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	}
	if _, err := time.Parse(time.RFC3339Nano, completed); err != nil {
		return errors.New("纪事时间无效")
	}
	var lock string
	if err := tx.QueryRowContext(ctx, "SELECT name FROM resource_locks WHERE name='journal' FOR UPDATE").Scan(&lock); err != nil {
		return err
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	var source any
	if sourceKey != "" {
		source = sourceKey
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO journal(kind,completed_at,payload,source_key) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE source_key=VALUES(source_key)", kind, completed, string(raw), source); err != nil {
		return err
	}
	return Trim(ctx, tx)
}
func Trim(ctx context.Context, tx *sql.Tx) error {
	// Only ten retained entries: comparing the small set avoids a second ledger.
	if _, err := tx.ExecContext(ctx, `DELETE older FROM journal older JOIN journal newer
        ON older.kind=newer.kind AND (CAST(older.payload AS JSON)=CAST(newer.payload AS JSON)
        OR (older.kind='service' AND JSON_EXTRACT(older.payload,'$.service')=JSON_EXTRACT(newer.payload,'$.service')))
        AND (older.completed_at<newer.completed_at OR (older.completed_at=newer.completed_at AND older.id<newer.id))`); err != nil {
		return err
	}

	var cutoff int64
	var completed string
	err := tx.QueryRowContext(ctx, "SELECT id,completed_at FROM journal ORDER BY completed_at DESC,id DESC LIMIT 1 OFFSET 9").Scan(&cutoff, &completed)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "DELETE FROM journal WHERE completed_at<? OR (completed_at=? AND id<?)", completed, completed, cutoff)
	return err
}
func (s Store) Append(ctx context.Context, kind string, payload map[string]any, completed, sourceKey string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = Append(ctx, tx, kind, payload, completed, sourceKey); err != nil {
		return err
	}
	return tx.Commit()
}
