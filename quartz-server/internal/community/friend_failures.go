package community

import (
	"context"
	"database/sql"
	"fmt"
	"goblincwl/quartz-server/internal/notifications"
)

func recordFriendFailureTx(ctx context.Context, tx *sql.Tx, id string, workErr error) error {
	if _, err := tx.ExecContext(ctx, "UPDATE friends SET processing_failures=processing_failures+1 WHERE id=?", id); err != nil {
		return err
	}
	var name, reason string
	var count, limit int
	if err := tx.QueryRowContext(ctx, "SELECT name,review_result,processing_failures,COALESCE((SELECT CAST(JSON_UNQUOTE(value) AS UNSIGNED) FROM settings WHERE `key`='friends.failureLimit'),5) FROM friends WHERE id=?", id).Scan(&name, &reason, &count, &limit); err != nil {
		return err
	}
	if workErr != nil {
		reason = workErr.Error()
	}
	if count >= limit {
		if err := notifications.EnqueueTx(ctx, tx, notifications.Event{Kind: "friends", RecordID: id, Title: "友链累计处理失败", Summary: fmt.Sprintf("%s 累计失败 %d 次，已达到通知阈值 %d 次。请检查并确认是否发送失败邮件或弃用；周期任务仍会继续处理。\n原因：%s", name, count, limit, reason), Status: "待人工确认"}); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, "UPDATE friends SET failure_notified=1 WHERE id=?", id)
		return err
	}
	return nil
}
