package community

import (
	"context"
	"database/sql"
	"errors"
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
	_, err = s.DB.ExecContext(ctx, "INSERT INTO feedback(id,email,browser,user_agent,description,status,created_at) VALUES(?,?,?,?,?,?,?)", f.ID, f.Email, f.Browser, userAgent, f.Description, f.Status, f.CreatedAt)
	return f, err
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
	var result sql.Result
	var err error
	if remove {
		result, err = s.DB.ExecContext(ctx, "DELETE FROM feedback WHERE id=?", id)
	} else {
		if status != "待处理" && status != "已解决" {
			return errors.New("反馈状态无效")
		}
		result, err = s.DB.ExecContext(ctx, "UPDATE feedback SET status=? WHERE id=?", status, id)
	}
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		var exists int
		if remove || s.DB.QueryRowContext(ctx, "SELECT count(*) FROM feedback WHERE id=?", id).Scan(&exists) != nil || exists == 0 {
			return errors.New("反馈不存在")
		}
	}
	return nil
}
