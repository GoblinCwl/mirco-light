package community

import (
	"context"
	"database/sql"
	guuid "github.com/google/uuid"
	"time"
)

func EnqueueFeedbackMailTx(ctx context.Context, tx *sql.Tx, id, address, description string) error {
	_, err := tx.ExecContext(ctx, "INSERT INTO friend_mail_outbox(id,friend_id,recipient,name,accepted,reason,created_at,kind) VALUES(?,?,?,'',1,?,?,'feedback')", guuid.NewString(), id, address, description, time.Now().UTC().Format(time.RFC3339Nano))
	return err
}
