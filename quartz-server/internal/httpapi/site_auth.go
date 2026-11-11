package httpapi

import (
	"errors"
	"goblincwl/quartz-server/internal/auth"
	"net/http"
)

func (s *Server) authentication(w http.ResponseWriter, r *http.Request, path string) {
	if s.Auth == nil {
		JSON(w, 503, map[string]string{"error": "认证尚未迁移"})
		return
	}
	if path == "/admin/logout" && r.Method == "POST" {
		if err := s.Auth.Logout(r.Context(), sessionToken(r)); err != nil {
			s.fail(w, err)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "quartz_stellar_session", Value: "", Path: "/api/site", HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode, MaxAge: -1})
		JSON(w, 200, map[string]bool{"ok": true})
		return
	}
	if (path == "/admin/login" || path == "/admin/totp/confirm" || path == "/admin/totp/finish" || path == "/admin/totp/rebind" || path == "/admin/password") && r.Method == "POST" {
		var input auth.Input
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
		var value map[string]any
		var err error
		switch path {
		case "/admin/login":
			value, err = s.Auth.Login(r.Context(), clientIP(r), input)
		case "/admin/password":
			value, err = s.Auth.ChangePassword(r.Context(), clientIP(r), input)
		case "/admin/totp/rebind":
			value, err = s.Auth.Rebind(r.Context(), clientIP(r), input)
		case "/admin/totp/confirm":
			value, err = s.Auth.Confirm(r.Context(), clientIP(r), input)
		default:
			value, err = s.Auth.Finish(r.Context(), clientIP(r), input)
		}
		if err != nil {
			var client *auth.Error
			if errors.As(err, &client) {
				s.fail(w, err)
			} else {
				JSON(w, 503, map[string]string{"error": "认证服务暂时不可用"})
			}
			return
		}
		if token, ok := value["token"].(string); ok {
			http.SetCookie(w, &http.Cookie{Name: "quartz_stellar_session", Value: token, Path: "/api/site", HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode, MaxAge: 43200})
			delete(value, "token")
		}
		JSON(w, 200, value)
		return
	}
	JSON(w, 404, map[string]string{"error": "接口不存在"})
}

// identity is the only public identity read. OpenList authorization is lazy and
// cannot make the site's own login status fail.
func (s *Server) identity(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if s.Auth == nil {
		JSON(w, 503, map[string]string{"error": "认证尚未配置"})
		return
	}
	value, err := s.Auth.Status(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	authenticated, err := s.Auth.CheckSession(r.Context(), sessionToken(r))
	if err != nil {
		s.fail(w, err)
		return
	}
	value["authenticated"] = authenticated
	if r.URL.Query().Get("share") == "true" {
		share := map[string]any{"configured": false}
		if authenticated && s.ShareSession != nil {
			share, err = s.ShareSession.Get(r.Context())
			if err != nil {
				share = map[string]any{"configured": false, "error": err.Error()}
			}
		}
		value["share"] = share
	}
	JSON(w, 200, value)
}
