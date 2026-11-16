package community

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

func (s Store) EnqueueManualFriendApproval(ctx context.Context, id string) error {
	tx, err := s.transaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	if err = tx.QueryRowContext(ctx, "SELECT status FROM friends WHERE id=? FOR UPDATE", id).Scan(&status); err != nil {
		return err
	}
	if status != "待审核" {
		return errors.New("仅待审核友链可提交检查")
	}
	var manual bool
	err = tx.QueryRowContext(ctx, "SELECT manual_approval FROM friend_jobs WHERE friend_id=? FOR UPDATE", id).Scan(&manual)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if !manual {
		if err = EnqueueFriendTx(ctx, tx, id); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, "UPDATE friend_jobs SET manual_approval=1 WHERE friend_id=?", id); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s Store) finishManualApproval(ctx context.Context, f Friend) error {
	tx, err := s.transaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, "UPDATE friends SET status='展示中',verified=0,review_result='人工审核：展示中',review_checked_at=? WHERE id=? AND status='待审核' AND review_ready=1 AND url=? AND rss_url=? AND avatar_source=?", time.Now().UTC().Format(time.RFC3339Nano), f.ID, f.URL, f.RSSURL, f.AvatarSource)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return errors.New("友链信息或审核状态已变化，请重新提交检查")
	}
	if err = EnqueueFriendMailTx(ctx, tx, f, true, "人工审核：展示中"); err != nil {
		return err
	}
	return tx.Commit()
}
