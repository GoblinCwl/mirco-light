package community

import (
	"context"
	"database/sql"
	"fmt"
	guuid "github.com/google/uuid"
	"time"
)

func EnqueueFriendMailTx(ctx context.Context, tx *sql.Tx, f Friend, accepted bool, reason string) error {
	if f.Email == "" {
		return nil
	} // Existing friends have no notification address.
	_, err := tx.ExecContext(ctx, "INSERT INTO friend_mail_outbox(id,friend_id,recipient,name,accepted,reason,created_at) VALUES(?,?,?,?,?,?,?)", guuid.NewString(), f.ID, f.Email, f.Name, accepted, reason, time.Now().UTC().Format(time.RFC3339Nano))
	return err
}

func EnqueueInspectionRemovalMailTx(ctx context.Context, tx *sql.Tx, f Friend, days int, reason string) error {
	_, err := tx.ExecContext(ctx, "INSERT INTO friend_mail_outbox(id,friend_id,recipient,name,accepted,reason,created_at,kind) VALUES(?,?,?,?,0,?,?,'friends-removed')", guuid.NewString(), f.ID, f.Email, f.Name, fmt.Sprintf("友链巡检累计失败 %d 天，本站已移除该友链。原因：%s。如需重新申请，请先检查站点、RSS 和头像地址。", days, reason), time.Now().UTC().Format(time.RFC3339Nano))
	return err
}
