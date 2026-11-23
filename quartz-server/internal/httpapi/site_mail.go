package httpapi

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"goblincwl/quartz-server/internal/friendmail"
)

func (s *Server) retryMail(w http.ResponseWriter, r *http.Request, id string) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		JSON(w, 405, map[string]string{"error": "请求方式不支持"})
		return
	}
	mailID, err := uuid.Parse(id)
	if err != nil || mailID.String() != id {
		JSON(w, 400, map[string]string{"error": "邮件编号无效"})
		return
	}
	queued, err := (friendmail.Store{DB: s.DB}).Retry(r.Context(), mailID.String())
	if err != nil {
		s.fail(w, err)
		return
	}
	if !queued {
		JSON(w, 409, map[string]string{"error": "这封邮件当前不可重试，请刷新记录。"})
		return
	}
	JSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) siteMail(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		JSON(w, 405, map[string]string{"error": "请求方式不支持"})
		return
	}
	query := r.URL.Query()
	state := query.Get("state")
	switch state {
	case "", "pending", "sent", "failed":
	default:
		JSON(w, 400, map[string]string{"error": "邮件状态无效"})
		return
	}
	page, _ := strconv.Atoi(query.Get("page"))
	result, err := (friendmail.Store{DB: s.DB}).Records(r.Context(), state, page)
	if err != nil {
		s.fail(w, err)
		return
	}
	JSON(w, 200, result)
}
