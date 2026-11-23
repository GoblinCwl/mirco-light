package friendmail

import (
	"context"
	"fmt"
	"time"
)

type DeliveryRecord struct {
	ID        string `json:"id"`
	Recipient string `json:"recipient"`
	Name      string `json:"name"`
	Title     string `json:"title"`
	State     string `json:"state"`
	Attempts  int    `json:"attempts"`
	CreatedAt string `json:"createdAt"`
	Error     string `json:"error"`
	SMTPCode  int    `json:"smtpCode,omitempty"`
	CanRetry  bool   `json:"canRetry"`
}

type DeliveryPage struct {
	Items    []DeliveryRecord `json:"items"`
	Page     int              `json:"page"`
	PageSize int              `json:"pageSize"`
	Total    int              `json:"total"`
}

func (s Store) Records(ctx context.Context, state string, page int) (DeliveryPage, error) {
	const pageSize = 30
	const filter = " FROM friend_mail_outbox WHERE (? = '' OR state = ?)"
	result := DeliveryPage{Items: []DeliveryRecord{}, PageSize: pageSize}
	if err := s.DB.QueryRowContext(ctx, "SELECT COUNT(*)"+filter, state, state).Scan(&result.Total); err != nil {
		return result, err
	}
	result.Page = min(max(1, page), max(1, (result.Total+pageSize-1)/pageSize))
	rows, err := s.DB.QueryContext(ctx, `
		SELECT id,recipient,name,kind,accepted,state,attempts,created_at,last_error,
			(state='failed' OR (state='pending' AND attempts>0 AND available_at>?))
	`+filter+" ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", time.Now().UnixMilli(), state, state, pageSize, (result.Page-1)*pageSize)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item DeliveryRecord
		var kind string
		var accepted bool
		if err := rows.Scan(&item.ID, &item.Recipient, &item.Name, &kind, &accepted, &item.State, &item.Attempts, &item.CreatedAt, &item.Error, &item.CanRetry); err != nil {
			return result, err
		}
		item.Title = mailHeading(kind, accepted)
		if item.State == "sent" {
			item.SMTPCode = 250 // net/smtp requires a 250 response after DATA.
		} else {
			var code int
			if _, err := fmt.Sscanf(item.Error, "SMTP %d ·", &code); err == nil {
				item.SMTPCode = code
			}
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func (s Store) Retry(ctx context.Context, id string) (bool, error) {
	now := time.Now().UnixMilli()
	result, err := s.DB.ExecContext(ctx, `
		UPDATE friend_mail_outbox
		SET attempts=IF(state='failed',0,attempts), state='pending', available_at=?, last_error=''
		WHERE id=? AND (state='failed' OR (state='pending' AND attempts>0 AND available_at>?))`, now, id, now)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	return changed == 1, err
}
