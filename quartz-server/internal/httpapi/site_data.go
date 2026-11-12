package httpapi

import (
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/datamanager"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) siteData(w http.ResponseWriter, r *http.Request, path string) {

	switch {
	case path == "/admin/data/tables" && r.Method == "GET":
		tables, err := (datamanager.Manager{DB: s.DB}).Catalog(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"tables": tables})
	case strings.HasPrefix(path, "/admin/data/tables/"):
		parts := strings.Split(strings.TrimPrefix(path, "/admin/data/tables/"), "/")
		if len(parts) > 2 || len(parts) == 2 && parts[1] != "blob" {
			JSON(w, 404, map[string]string{"error": "接口不存在"})
			return
		}
		var key map[string]any
		if raw := r.URL.Query().Get("key"); raw != "" {
			if err := json.Unmarshal([]byte(raw), &key); err != nil {
				s.fail(w, errors.New("记录标识无效"))
				return
			}
		}
		manager := datamanager.Manager{DB: s.DB}

		if len(parts) == 2 && r.Method == "GET" {
			data, mime, err := manager.Blob(r.Context(), parts[0], key, r.URL.Query().Get("column"))
			if err != nil {
				s.fail(w, err)
				return
			}
			w.Header().Set("Content-Type", mime)
			w.Header().Set("Content-Disposition", `attachment; filename="image"`)
			w.Write(data)
			return
		}
		switch r.Method {
		case "GET":
			if key != nil {
				record, err := manager.Read(r.Context(), parts[0], key)
				if err != nil {
					s.fail(w, err)
					return
				}
				JSON(w, 200, map[string]any{"record": record})
				return
			}
			page := 1
			if raw := r.URL.Query().Get("page"); raw != "" {
				var err error
				page, err = strconv.Atoi(raw)
				if err != nil {
					s.fail(w, errors.New("页码无效"))
					return
				}
			}
			value, err := manager.List(r.Context(), parts[0], page, r.URL.Query().Get("query"))
			if err != nil {
				s.fail(w, err)
				return
			}
			JSON(w, 200, value)
		case "POST", "PUT":
			if r.Method == "PUT" && key == nil {
				s.fail(w, errors.New("记录标识无效"))
				return
			}
			if r.Method == "POST" {
				key = nil
			}
			var input struct {
				Values map[string]any `json:"values"`
			}
			if err := body(w, r, &input); err != nil {
				s.fail(w, err)
				return
			}
			value, err := manager.Save(r.Context(), parts[0], input.Values, key)
			if err != nil {
				s.fail(w, err)
				return
			}
			if parts[0] == "friends" {
				s.wakeFriendJobs()
			}
			status := 200
			if r.Method == "POST" {
				status = 201
			}
			if s.DataChanged != nil {
				s.DataChanged(parts[0])
			}
			JSON(w, status, value)
		case "DELETE":
			if err := manager.Remove(r.Context(), parts[0], key); err != nil {
				s.fail(w, err)
				return
			}
			if s.DataChanged != nil {
				s.DataChanged(parts[0])
			}
			JSON(w, 200, map[string]bool{"ok": true})
		default:
			JSON(w, 405, map[string]string{"error": "请求方式不支持"})
		}

	default:
		JSON(w, 404, map[string]string{"error": "接口不存在"})
	}
}
