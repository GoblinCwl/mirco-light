package httpapi

import (
	"errors"
	"goblincwl/quartz-server/internal/buildcontrol"
	"goblincwl/quartz-server/internal/settings"
	"net/http"
	"strings"
)

func (s *Server) siteConfiguration(w http.ResponseWriter, r *http.Request, path string) {
	switch {
	case path == "/admin/build" && (r.Method == "GET" || r.Method == "POST"):
		if s.Build == nil {
			JSON(w, 503, map[string]string{"error": "构建服务尚未就绪"})
			return
		}
		var value map[string]any
		var err error
		if r.Method == "GET" {
			value, err = s.Build.Status()
		} else {
			var values map[string]any
			values, err = (settings.Store{DB: s.DB}).Read(r.Context(), false)
			if err == nil {
				value, err = s.Build.Reload(r.Context(), values)
			}
		}
		if err != nil {
			status := 503
			var problem *buildcontrol.Problem
			if errors.As(err, &problem) {
				status = problem.Status
			}
			JSON(w, status, map[string]string{"error": err.Error()})
			return
		}
		status := 200
		if r.Method == "POST" {
			status = 202
		}
		JSON(w, status, value)
	case path == "/admin/upstreams" && r.Method == "GET":
		if s.Credentials == nil {
			JSON(w, 503, map[string]string{"error": "平台凭据尚未迁移"})
			return
		}
		values := map[string]any{}
		for _, id := range []string{"github", "gitea", "bilibili"} {
			value, err := s.Credentials.Describe(r.Context(), id)
			if err != nil {
				s.fail(w, err)
				return
			}
			secret, err := s.Credentials.Read(r.Context(), id)
			if err != nil {
				s.fail(w, err)
				return
			}
			value["value"] = secret
			values[id] = value
		}
		w.Header().Set("Cache-Control", "no-store")
		JSON(w, 200, values)
	case strings.HasPrefix(path, "/admin/upstreams/"):
		if s.Credentials == nil {
			JSON(w, 503, map[string]string{"error": "平台凭据尚未迁移"})
			return
		}
		parts := strings.Split(strings.TrimPrefix(path, "/admin/upstreams/"), "/")
		if len(parts) > 2 {
			JSON(w, 404, map[string]string{"error": "接口不存在"})
			return
		}
		if len(parts) == 2 && parts[1] == "verify" && r.Method == "POST" {
			value, err := s.Credentials.Check(r.Context(), parts[0])
			if err != nil {
				s.fail(w, err)
				return
			}
			JSON(w, 200, value)
			return
		}
		if len(parts) == 1 && r.Method == "PUT" {
			var input struct {
				Value string `json:"value"`
			}
			if err := body(w, r, &input); err != nil {
				s.fail(w, err)
				return
			}
			value, err := s.Credentials.Save(r.Context(), parts[0], input.Value)
			if err != nil {
				s.fail(w, err)
				return
			}
			if s.CredentialChanged != nil {
				s.CredentialChanged(parts[0])
			}
			JSON(w, 200, value)
			return
		}
		JSON(w, 404, map[string]string{"error": "接口不存在"})
	case path == "/settings" && r.Method == "GET":
		value, err := (settings.Store{DB: s.DB}).Read(r.Context(), true)
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"values": value})
	case path == "/admin/settings" && r.Method == "GET":
		value, err := (settings.Store{DB: s.DB}).Read(r.Context(), false)
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"schema": settings.Schema(), "values": value})
	case strings.HasPrefix(path, "/admin/settings/") && r.Method == "PUT":
		key := strings.TrimPrefix(path, "/admin/settings/")
		var input struct {
			Value any `json:"value"`
		}
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
		value, err := (settings.Store{DB: s.DB}).Save(r.Context(), key, input.Value)
		if err != nil {
			s.fail(w, err)
			return
		}
		if s.SettingsChanged != nil {
			s.SettingsChanged(key)
		}
		JSON(w, 200, map[string]any{"ok": true, "value": value})

	default:
		JSON(w, 404, map[string]string{"error": "接口不存在"})
	}
}
