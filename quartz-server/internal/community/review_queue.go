package community

import (
	"context"
	"database/sql"
	"errors"
)

func enqueueReviewTx(ctx context.Context, tx *sql.Tx, id string) (bool, error) {
	var state string
	err := tx.QueryRowContext(ctx, "SELECT state FROM friend_jobs WHERE friend_id=? FOR UPDATE", id).Scan(&state)
	if err == nil {
		return false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	if err = EnqueueFriendTx(ctx, tx, id); err != nil {
		return false, err
	}
	return true, nil
}
func (s Store) EnqueueFriendReview(ctx context.Context, id string) error {
	tx, err := s.transaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	if err = tx.QueryRowContext(ctx, "SELECT status FROM friends WHERE id=? FOR UPDATE", id).Scan(&status); errors.Is(err, sql.ErrNoRows) {
		return ErrFriendNotFound
	} else if err != nil {
		return err
	}
	if status != "待审核" {
		return errors.New("仅待审核友链可执行自动审核，已通过的友链不会重复入队")
	}
	if _, err = enqueueReviewTx(ctx, tx, id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s Store) EnqueuePendingFriendReviews(ctx context.Context) (int, error) {
	tx, err := s.transaction(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, "SELECT id FROM friends WHERE status='待审核' ORDER BY number FOR UPDATE")
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return 0, err
	}
	queued := 0
	for _, id := range ids {
		added, e := enqueueReviewTx(ctx, tx, id)
		if e != nil {
			return 0, e
		}
		if added {
			queued++
		}
	}
	return queued, tx.Commit()
}
