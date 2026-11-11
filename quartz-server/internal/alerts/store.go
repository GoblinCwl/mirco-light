package alerts

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"
)

type Event struct {
	Kind    string `json:"kind"`
	Level   string `json:"level"`
	Source  string `json:"source"`
	Title   string `json:"title"`
	Message string `json:"message"`
	Target  string `json:"target"`
	Code    int    `json:"code"`
}
type Record struct {
	ID int64 `json:"id"`
	Event
	FirstSeen   string `json:"firstSeen"`
	LastSeen    string `json:"lastSeen"`
	Occurrences int64  `json:"occurrences"`
}
type Store struct{ DB *sql.DB }

func clean(value string, limit int) string {
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, value)
	runes := []rune(strings.TrimSpace(value))
	if len(runes) > limit {
		runes = runes[:limit]
	}
	return string(runes)
}
func normalize(e Event) (Event, error) {
	if e.Kind != "api" && e.Kind != "service" && e.Kind != "task" && e.Kind != "runtime" {
		return e, errors.New("告警类型无效")
	}
	if e.Kind == "api" && APILevel(e.Source, e.Target) == "warning" {
		e.Level = "warning"
	}
	if e.Kind == "task" && (e.Source == "GitHub 用户与活动" || e.Source == "Bilibili 用户与动态" || e.Source == "视频同步") {
		e.Level = "warning"
	}
	if e.Level == "" {
		e.Level = "error"
	}
	if e.Level != "error" && e.Level != "warning" {
		return e, errors.New("告警级别无效")
	}
	e.Source = clean(e.Source, 100)
	e.Title = clean(e.Title, 200)
	e.Message = clean(e.Message, 1000)
	e.Target = clean(SafeTarget(e.Target), 255)
	if e.Source == "" || e.Title == "" {
		return e, errors.New("告警来源或标题为空")
	}
	return e, nil
}

// RecordTx joins an existing transaction (used by the existing observer consumer).
// A ten-minute quiet gap starts a new incident; continuous repeats share one row.
func RecordTx(ctx context.Context, tx *sql.Tx, event Event, now time.Time) error {
	event, err := normalize(event)
	if err != nil {
		return err
	}
	var lock string
	if err = tx.QueryRowContext(ctx, "SELECT name FROM resource_locks WHERE name='alerts' FOR UPDATE").Scan(&lock); err != nil {
		return err
	}
	raw, _ := json.Marshal([]any{event.Kind, event.Source, event.Title, event.Target, event.Code})
	fingerprint := sha256.Sum256(raw)
	stamp := now.UTC().Format("2006-01-02T15:04:05.000Z")
	cutoff := now.Add(-10 * time.Minute).UTC().Format("2006-01-02T15:04:05.000Z")
	var id int64
	err = tx.QueryRowContext(ctx, "SELECT id FROM alerts WHERE fingerprint=? AND last_seen>=? ORDER BY id DESC LIMIT 1 FOR UPDATE", fingerprint[:], cutoff).Scan(&id)
	if err == nil {
		_, err = tx.ExecContext(ctx, "UPDATE alerts SET last_seen=GREATEST(last_seen,?),occurrences=occurrences+1,level=?,message=? WHERE id=?", stamp, event.Level, event.Message, id)
		return err
	}
	if err != sql.ErrNoRows {
		return err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO alerts(fingerprint,kind,level,source,title,message,target,status_code,first_seen,last_seen,occurrences) VALUES(?,?,?,?,?,?,?,?,?,?,1)", fingerprint[:], event.Kind, event.Level, event.Source, event.Title, event.Message, event.Target, event.Code, stamp, stamp); err != nil {
		return err
	}
	// Retention is performed only when an incident is inserted, with no cleanup timer.
	var oldest int64
	var oldestSeen string
	err = tx.QueryRowContext(ctx, "SELECT id,last_seen FROM alerts ORDER BY last_seen DESC,id DESC LIMIT 1 OFFSET 999").Scan(&oldest, &oldestSeen)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, "DELETE FROM alerts WHERE last_seen<? OR (last_seen=? AND id<?)", oldestSeen, oldestSeen, oldest)
	return err
}
func (s Store) Record(ctx context.Context, event Event) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err = RecordTx(ctx, tx, event, time.Now()); err != nil {
		return err
	}
	return tx.Commit()
}
func (s Store) List(ctx context.Context, page int, kind, query string) (map[string]any, error) {
	if page < 1 {
		page = 1
	}
	if page > 100000 {
		page = 100000
	}
	where := " WHERE 1=1"
	args := []any{}
	if kind != "" {
		if kind != "api" && kind != "service" && kind != "task" && kind != "runtime" {
			return nil, errors.New("告警类型无效")
		}
		where += " AND kind=?"
		args = append(args, kind)
	}
	if query = clean(query, 100); query != "" {
		where += " AND (LOCATE(LOWER(?),LOWER(source))>0 OR LOCATE(LOWER(?),LOWER(title))>0 OR LOCATE(LOWER(?),LOWER(message))>0 OR LOCATE(LOWER(?),LOWER(target))>0)"
		args = append(args, query, query, query, query)
	}
	var total int
	if err := s.DB.QueryRowContext(ctx, "SELECT count(*) FROM alerts"+where, args...).Scan(&total); err != nil {
		return nil, err
	}
	pages := max(1, (total+19)/20)
	page = min(page, pages)
	rows, err := s.DB.QueryContext(ctx, "SELECT id,kind,level,source,title,message,target,status_code,first_seen,last_seen,occurrences FROM alerts"+where+" ORDER BY last_seen DESC,id DESC LIMIT 20 OFFSET ?", append(args, (page-1)*20)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Record{}
	for rows.Next() {
		var r Record
		if err := rows.Scan(&r.ID, &r.Kind, &r.Level, &r.Source, &r.Title, &r.Message, &r.Target, &r.Code, &r.FirstSeen, &r.LastSeen, &r.Occurrences); err != nil {
			return nil, err
		}
		items = append(items, r)
	}
	return map[string]any{"records": items, "page": page, "pages": pages, "total": total}, rows.Err()
}

func TaskName(name string) string {
	labels := map[string]string{"index-share": "分享索引", "index-repo": "仓库索引", "article-index": "文章索引", "comment-permissions": "评论权限", "gitea-mirror-credential": "镜像凭据", "github-social": "GitHub 用户与活动", "bilibili-social": "Bilibili 用户与动态", "activitywatch-summary": "ActivityWatch 汇总", "auth-cleanup": "认证数据清理", "service-journal": "服务纪事", "build-journal": "构建纪事"}
	if label := labels[name]; label != "" {
		return label
	}
	return name
}
