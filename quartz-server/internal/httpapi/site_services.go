package httpapi

import (
	"goblincwl/quartz-server/internal/monitoring"
	"goblincwl/quartz-server/internal/settings"
	"net/http"
	"strings"
)

func (s *Server) siteServices(w http.ResponseWriter, r *http.Request, path string) {
	if s.Monitoring == nil || s.Monitoring.Registry == nil {
		JSON(w, 503, map[string]string{"error": "服务状态管理未就绪"})
		return
	}
	registry := s.Monitoring.Registry
	credentials := strings.HasPrefix(path, "/admin/service-credentials")
	base := "/admin/services"
	if credentials {
		base = "/admin/service-credentials"
	}
	id := strings.TrimPrefix(path, base)
	if id != "" && !strings.HasPrefix(id, "/") {
		JSON(w, 404, map[string]string{"error": "接口不存在"})
		return
	}
	id = strings.TrimPrefix(id, "/")
	if strings.Contains(id, "/") {
		JSON(w, 404, map[string]string{"error": "接口不存在"})
		return
	}
	var err error
	switch {
	case r.Method == "GET" && id == "":
		services, e := registry.Services(r.Context(), false)
		if e != nil {
			s.fail(w, e)
			return
		}
		accounts, e := registry.Credentials(r.Context())
		if e != nil {
			s.fail(w, e)
			return
		}
		values, e := (settings.Store{DB: s.DB}).Read(r.Context(), false)
		if e != nil {
			s.fail(w, e)
			return
		}
		JSON(w, 200, map[string]any{"services": services, "credentials": accounts, "integrations": monitoring.IntegrationOptions(values)})
		return
	case (r.Method == "POST" && id == "") || (r.Method == "PUT" && id != ""):
		if credentials {
			var input monitoring.Credential
			if err = body(w, r, &input); err == nil {
				input.ID = id
				err = registry.SaveCredential(r.Context(), input, r.Method == "POST")
			}
		} else {
			var input struct {
				monitoring.ServiceConfig
				Authentication *monitoring.Credential `json:"authentication"`
			}
			if err = body(w, r, &input); err == nil {
				input.ID = id
				err = registry.SaveConfiguredService(r.Context(), input.ServiceConfig, input.Authentication, r.Method == "POST")
			}
		}
	case r.Method == "DELETE" && id != "":
		if credentials {
			err = registry.DeleteCredential(r.Context(), id)
		} else {
			err = registry.DeleteService(r.Context(), id)
		}
	default:
		JSON(w, 405, map[string]string{"error": "请求方法不支持"})
		return
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	s.Monitoring.InvalidateServices()
	JSON(w, 200, map[string]bool{"ok": true})
}
