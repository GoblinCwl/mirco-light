package starbud

import (
	"context"
	"database/sql"
	"regexp"
)

const archivePageSize = 25

var conversationID = regexp.MustCompile("^[a-f0-9]{64}$")

func ValidConversationID(id string) bool { return conversationID.MatchString(id) }

type Page[T any] struct {
	Items []T `json:"items"`
	Page  int `json:"page"`
	Pages int `json:"pages"`
	Total int `json:"total"`
}

func archivePage[T any](page, total int) Page[T] {
	pages := max(1, (total+archivePageSize-1)/archivePageSize)
	return Page[T]{Items: []T{}, Page: min(max(1, page), pages), Pages: pages, Total: total}
}

type Conversation struct {
	ID       string `json:"id"`
	IP       string `json:"ip"`
	IPSource string `json:"ip_source"`
	LastSeen string `json:"last_seen"`
	Turns    int    `json:"turns"`
}

type Turn struct {
	CreatedAt string  `json:"created_at"`
	PageURL   string  `json:"page_url"`
	Question  string  `json:"question"`
	Answer    *string `json:"answer"`
	Status    string  `json:"status"`
}

func ListConversations(ctx context.Context, db *sql.DB, page int) (Page[Conversation], error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT conversation_id) FROM starbud_chat_records`).Scan(&total); err != nil {
		return Page[Conversation]{}, err
	}
	result := archivePage[Conversation](page, total)
	rows, err := db.QueryContext(ctx, `
		SELECT grouped.conversation_id, COALESCE(latest.client_ip, visitors.ip, ''),
		       CASE WHEN latest.client_ip IS NOT NULL THEN 'chat'
		            WHEN visitors.ip IS NOT NULL AND visitors.ip <> '' THEN 'visitor' ELSE '' END,
		       latest.created_at, grouped.turns
		FROM (
			SELECT conversation_id, MAX(id) AS latest_id, COUNT(*) AS turns
			FROM starbud_chat_records GROUP BY conversation_id
		) AS grouped
		JOIN starbud_chat_records AS latest ON latest.id=grouped.latest_id
		LEFT JOIN visitors ON visitors.identity=CONVERT(grouped.conversation_id USING utf8mb4) COLLATE utf8mb4_bin
		ORDER BY grouped.latest_id DESC LIMIT ? OFFSET ?`, archivePageSize, (result.Page-1)*archivePageSize)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item Conversation
		if err := rows.Scan(&item.ID, &item.IP, &item.IPSource, &item.LastSeen, &item.Turns); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func ListTurns(ctx context.Context, db *sql.DB, id string, page int) (Page[Turn], error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM starbud_chat_records WHERE conversation_id=?`, id).Scan(&total); err != nil {
		return Page[Turn]{}, err
	}
	result := archivePage[Turn](page, total)
	rows, err := db.QueryContext(ctx, `
		SELECT created_at,page_url,question,answer,status FROM (
			SELECT id,created_at,page_url,question,answer,status FROM starbud_chat_records
			WHERE conversation_id=? ORDER BY id DESC LIMIT ? OFFSET ?
		) AS recent ORDER BY id`, id, archivePageSize, (result.Page-1)*archivePageSize)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item Turn
		if err := rows.Scan(&item.CreatedAt, &item.PageURL, &item.Question, &item.Answer, &item.Status); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func DeleteConversation(ctx context.Context, db *sql.DB, id string) error {
	_, err := db.ExecContext(ctx, `DELETE FROM starbud_chat_records WHERE conversation_id=?`, id)
	return err
}
