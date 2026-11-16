package community

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/notifications"
	"time"
)

var ErrFriendNotFound = errors.New("友链记录不存在，请刷新列表")

func (s Store) friendByID(ctx context.Context, id string) (Friend, error) {
	friends, err := s.Friends(ctx, false)
	if err != nil {
		return Friend{}, err
	}
	for _, friend := range friends {
		if friend.ID == id {
			return friend, nil
		}
	}
	return Friend{}, ErrFriendNotFound
}
func (s Store) AutoReviewFriend(ctx context.Context, id string) (Friend, error) {
	friend, err := s.friendByID(ctx, id)
	if err != nil {
		return friend, err
	}
	return s.autoReviewSnapshot(ctx, friend)
}
func (s Store) autoReviewSnapshot(ctx context.Context, friend Friend) (Friend, error) {
	if friend.Status != "待审核" {
		return friend, nil
	}
	if !friend.ReviewReady {
		return friend, errors.New("首页、RSS 和头像预检查尚未通过，不能自动审核")
	}
	if s.CheckBacklink == nil {
		return friend, errors.New("自动审核尚未配置")
	}
	own, cancel := context.WithTimeout(ctx, 25*time.Second)
	result, checkErr := s.CheckBacklink(own, friend)
	cancel()
	if ctx.Err() != nil {
		return friend, ctx.Err()
	}
	status := "待审核"
	message := result.Message
	if checkErr != nil {
		message = "自动审核未完成：" + checkErr.Error()
	} else if result.Found {
		status = "展示中"
	}
	if len([]rune(message)) > 255 {
		message = string([]rune(message)[:255])
	}
	if message == "" {
		message = "未检测到本站友链，保留待审核"
	}
	checkedAt := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return friend, err
	}
	defer tx.Rollback()
	changed, err := tx.ExecContext(ctx, "UPDATE friends SET status=?,review_result=?,review_checked_at=? WHERE id=? AND status='待审核' AND review_ready=1 AND url=? AND backlink_url=?", status, message, checkedAt, friend.ID, friend.URL, friend.BacklinkURL)
	if err != nil {
		return friend, err
	}
	n, err := changed.RowsAffected()
	if err != nil {
		return friend, err
	}
	if n > 0 && status == "展示中" {
		if err = EnqueueFriendMailTx(ctx, tx, friend, true, "已检测到指向本站的友链，自动审核通过"); err != nil {
			return friend, err
		}
		if err = notifications.EnqueueTx(ctx, tx, notifications.Event{Kind: "friends", RecordID: friend.ID, Title: "友链自动审核通过", Summary: friend.Name + "：" + message, Status: status}); err != nil {
			return friend, err
		}
	}
	if err = tx.Commit(); err != nil {
		return friend, err
	}
	// Reload to report the actual result if an administrator edited it during the fetch.
	current, err := s.friendByID(ctx, friend.ID)
	if err != nil {
		return friend, err
	}
	return current, checkErr
}
