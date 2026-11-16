package community

import (
	"context"
	"database/sql"
	"errors"
	"goblincwl/quartz-server/internal/notifications"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

type Feedback struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	Browser     string `json:"browser"`
	Description string `json:"description"`
	Status      string `json:"status"`
	CreatedAt   string `json:"createdAt"`
}

var email = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func (s Store) Submit(ctx context.Context, f Feedback, userAgent string) (Feedback, error) {
	f.Email = strings.TrimSpace(f.Email)
	f.Description = strings.TrimSpace(f.Description)
	if len(f.Email) > 254 || !email.MatchString(f.Email) {
		return f, errors.New("请输入有效的邮箱地址")
	}
	if f.Description == "" || utf8.RuneCountInString(f.Description) > 2000 {
		return f, errors.New("请填写问题描述，最多 2000 字")
	}
	f.Browser = clip(f.Browser, 300)
	userAgent = clip(userAgent, 1500)
	var err error
	f.ID, err = uuid()
	if err != nil {
		return f, err
	}
	f.Status = "待处理"
	f.CreatedAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return f, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, "INSERT INTO feedback(id,email,browser,user_agent,description,status,created_at) VALUES(?,?,?,?,?,?,?)", f.ID, f.Email, f.Browser, userAgent, f.Description, f.Status, f.CreatedAt)
	if err != nil {
		return f, err
	}
	if err = notifications.EnqueueTx(ctx, tx, notifications.Event{Kind: "feedback", RecordID: f.ID, Title: "收到问题反馈", Summary: f.Description, Status: f.Status}); err != nil {
		return f, err
	}
	return f, tx.Commit()
}
func clip(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}
func (s Store) Feedback(ctx context.Context, page int) (map[string]any, error) {
	if page < 1 {
		return nil, errors.New("页码无效")
	}
	var total int
	if err := s.DB.QueryRowContext(ctx, "SELECT count(*) FROM feedback").Scan(&total); err != nil {
		return nil, err
	}
	pages := (total + 29) / 30
	if pages < 1 {
		pages = 1
	}
	if page > pages {
		page = pages
	}
	rows, err := s.DB.QueryContext(ctx, "SELECT id,email,browser,description,status,created_at FROM feedback ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ?", (page-1)*30)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Feedback{}
	for rows.Next() {
		var f Feedback
		if err = rows.Scan(&f.ID, &f.Email, &f.Browser, &f.Description, &f.Status, &f.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, f)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	return map[string]any{"page": page, "items": items, "total": total}, nil
}
func (s Store) UpdateFeedback(ctx context.Context, id, status string, remove bool) error {
	if !remove && status != "待处理" && status != "已解决" {
		return errors.New("反馈状态无效")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var old, description, address string
	if err = tx.QueryRowContext(ctx, "SELECT status,description,email FROM feedback WHERE id=? FOR UPDATE", id).Scan(&old, &description, &address); err == sql.ErrNoRows {
		return errors.New("反馈不存在")
	} else if err != nil {
		return err
	}
	if remove {
		_, err = tx.ExecContext(ctx, "DELETE FROM feedback WHERE id=?", id)
	} else {
		_, err = tx.ExecContext(ctx, "UPDATE feedback SET status=? WHERE id=?", status, id)
		if err == nil && old != status {
			if status == "已解决" {
				if err = EnqueueFeedbackMailTx(ctx, tx, id, address, description); err != nil {
					return err
				}
			}
			err = notifications.EnqueueTx(ctx, tx, notifications.Event{Kind: "feedback", RecordID: id, Title: "反馈处理状态更新", Summary: description, Status: status})
		}
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}
