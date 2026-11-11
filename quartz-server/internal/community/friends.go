package community

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"
)

type Store struct{ DB *sql.DB }
type Friend struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	URL         string `json:"url"`
	Avatar      string `json:"avatar"`
	Description string `json:"description"`
	Example     bool   `json:"example,omitempty"`
	Status      string `json:"status"`
}

func uuid() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = b[6]&15 | 64
	b[8] = b[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
func website(value string) (string, error) {
	if len(value) > 1500 {
		return "", errors.New("请填写有效的网站链接")
	}
	u, err := url.Parse(value)
	if err != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", errors.New("请使用有效的 http 或 https 链接")
	}
	if u.Path == "" {
		u.Path = "/"
	}
	u.Host = strings.ToLower(u.Host)
	return u.String(), nil
}
func validFriend(f Friend, application bool) (Friend, error) {
	f.Name = strings.TrimSpace(f.Name)
	f.Avatar = strings.TrimSpace(f.Avatar)
	f.Description = strings.TrimSpace(f.Description)
	if f.Name == "" || utf8.RuneCountInString(f.Name) > 80 || strings.IndexFunc(f.Name, func(c rune) bool { return c < 32 }) >= 0 {
		return f, errors.New("请填写站点名称，最多 80 字")
	}
	address, err := website(f.URL)
	if err != nil {
		return f, err
	}
	f.URL = address
	if utf8.RuneCountInString(f.Description) > 300 {
		return f, errors.New("站点简介最多 300 字")
	}
	if f.Avatar != "" {
		if strings.HasPrefix(f.Avatar, "/static/") {
			if strings.Contains(f.Avatar, "\\") || containsSegment(f.Avatar, "..") {
				return f, errors.New("头像链接无效")
			}
		} else {
			if _, err = website(f.Avatar); err != nil {
				return f, errors.New("头像链接无效")
			}
		}
	}
	if application {
		f.Status = "待审核"
		f.Example = false
		if f.Avatar == "" || f.Description == "" || utf8.RuneCountInString(f.Description) > 40 {
			return f, errors.New("请填写头像和站点简介，简介最多40字")
		}
		if !strings.HasPrefix(f.URL, "https://") || !strings.HasPrefix(f.Avatar, "https://") {
			return f, errors.New("网站和头像地址须为 HTTPS 链接")
		}
	}
	if f.Status == "" {
		f.Status = "展示中"
	}
	if f.Status != "展示中" && f.Status != "待审核" && f.Status != "已失效" {
		return f, errors.New("友链状态无效")
	}
	return f, nil
}
func containsSegment(path, segment string) bool {
	for _, p := range strings.Split(path, "/") {
		if p == segment {
			return true
		}
	}
	return false
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func readFriends(ctx context.Context, q queryer, public bool) ([]Friend, error) {
	query := "SELECT id,name,url,avatar,description,example,status FROM friends"
	if public {
		query += " WHERE status='展示中'"
	}
	query += " ORDER BY position,id"
	rows, err := q.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	friends := []Friend{}
	for rows.Next() {
		var f Friend
		if err = rows.Scan(&f.ID, &f.Name, &f.URL, &f.Avatar, &f.Description, &f.Example, &f.Status); err != nil {
			return nil, err
		}
		friends = append(friends, f)
	}
	return friends, rows.Err()
}
func (s Store) Friends(ctx context.Context, public bool) ([]Friend, error) {
	return readFriends(ctx, s.DB, public)
}
func (s Store) transaction(ctx context.Context) (*sql.Tx, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	var name string
	if err = tx.QueryRowContext(ctx, "SELECT name FROM resource_locks WHERE name='friends' FOR UPDATE").Scan(&name); err != nil {
		tx.Rollback()
		return nil, err
	}
	return tx, nil
}
func (s Store) CreateFriend(ctx context.Context, f Friend, application bool) (Friend, []Friend, error) {
	f, err := validFriend(f, application)
	if err != nil {
		return f, nil, err
	}
	f.ID, err = uuid()
	if err != nil {
		return f, nil, err
	}
	tx, err := s.transaction(ctx)
	if err != nil {
		return f, nil, err
	}
	defer tx.Rollback()
	var count int
	var position int64
	if err = tx.QueryRowContext(ctx, "SELECT count(*),coalesce(max(position),-1)+1 FROM friends").Scan(&count, &position); err != nil {
		return f, nil, err
	}
	if count >= 150 {
		return f, nil, errors.New("最多可添加 150 个站点")
	}
	var duplicates int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM friends WHERE url=?", f.URL).Scan(&duplicates); err != nil {
		return f, nil, err
	}
	if duplicates > 0 {
		return f, nil, errors.New("该站点已展示或已提交申请，请勿重复提交")
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO friends(id,name,url,avatar,description,example,position,status) VALUES(?,?,?,?,?,?,?,?)", f.ID, f.Name, f.URL, f.Avatar, f.Description, f.Example, position, f.Status); err != nil {
		return f, nil, err
	}
	friends, err := readFriends(ctx, tx, false)
	if err != nil {
		return f, nil, err
	}
	if err = tx.Commit(); err != nil {
		return f, nil, err
	}
	return f, friends, nil
}
func (s Store) UpdateFriend(ctx context.Context, id string, f Friend, action string, offset int) ([]Friend, error) {
	tx, err := s.transaction(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	friends, err := readFriends(ctx, tx, false)
	if err != nil {
		return nil, err
	}
	index := -1
	for i, row := range friends {
		if row.ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return nil, errors.New("友链记录不存在，请刷新列表")
	}
	switch action {
	case "delete":
		_, err = tx.ExecContext(ctx, "DELETE FROM friends WHERE id=?", id)
	case "move":
		if offset != 1 && offset != -1 {
			return nil, errors.New("排序方向无效")
		}
		other := index + offset
		if other >= 0 && other < len(friends) {
			friends[index], friends[other] = friends[other], friends[index]
			for i, row := range friends {
				if _, err = tx.ExecContext(ctx, "UPDATE friends SET position=? WHERE id=?", i, row.ID); err != nil {
					return nil, err
				}
			}
		}
	case "review":
		current := friends[index]
		current.Status = f.Status
		if _, err = validFriend(current, false); err != nil {
			return nil, err
		}
		_, err = tx.ExecContext(ctx, "UPDATE friends SET status=? WHERE id=?", current.Status, id)
	case "update":
		f.ID = id
		f.Example = friends[index].Example
		f, err = validFriend(f, false)
		if err != nil {
			return nil, err
		}
		var duplicate int
		if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM friends WHERE url=? AND id<>?", f.URL, id).Scan(&duplicate); err != nil {
			return nil, err
		}
		if duplicate > 0 {
			return nil, errors.New("该站点链接已经存在")
		}
		_, err = tx.ExecContext(ctx, "UPDATE friends SET name=?,url=?,avatar=?,description=?,status=? WHERE id=?", f.Name, f.URL, f.Avatar, f.Description, f.Status, id)
	default:
		return nil, errors.New("操作无效")
	}
	if err != nil {
		return nil, err
	}
	friends, err = readFriends(ctx, tx, false)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return friends, nil
}

// ValidateFriend is shared by the dedicated and generic administrator editors.
func ValidateFriend(f Friend) (Friend, error) { return validFriend(f, false) }
