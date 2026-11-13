package httpapi

import (
	"errors"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/friendavatar"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) siteCommunity(w http.ResponseWriter, r *http.Request, path string, feedbackLimits *limiter) {
	communityStore := community.Store{DB: s.DB}

	switch {
	case strings.HasPrefix(path, "/friends/avatar/") && (r.Method == "GET" || r.Method == "HEAD"):
		name := strings.TrimPrefix(path, "/friends/avatar/")
		if !friendavatar.Filename(name) || s.FriendAvatars == nil {
			http.NotFound(w, r)
			return
		}
		etag := `"` + name + `"`
		// Hash names are immutable; revalidation never requires a remote fetch.
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("ETag", etag)
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		data, mime, err := s.FriendAvatars.Read(r.Context(), name)
		if err != nil {
			w.Header().Set("Cache-Control", "no-store")
			http.Error(w, "头像暂时无法读取", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Length", strconv.Itoa(len(data)))
		if r.Method == "GET" {
			w.Write(data)
		}
	case path == "/friends" && r.Method == "GET":
		value, err := communityStore.Friends(r.Context(), true)
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"friends": value})
	case path == "/friends/apply" && r.Method == "POST":
		if !feedbackLimits.allow("friends:" + clientIP(r)) {
			JSON(w, 429, map[string]string{"error": "提交较为频繁，请 10 分钟后再试"})
			return
		}
		var input community.Friend
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
		value, _, err := communityStore.CreateFriend(r.Context(), input, true)
		if err != nil {
			s.fail(w, err)
			return
		}
		s.wakeFriendJobs()
		JSON(w, 201, map[string]any{"application": map[string]any{"id": value.ID, "status": value.Status, "queued": true}})
	case path == "/feedback" && r.Method == "POST":
		if !feedbackLimits.allow(clientIP(r)) {
			JSON(w, 429, map[string]string{"error": "提交较为频繁，请 10 分钟后再试"})
			return
		}
		var input community.Feedback
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
		value, err := communityStore.Submit(r.Context(), input, r.UserAgent())
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 201, map[string]any{"feedback": map[string]string{"id": value.ID, "status": value.Status}})
	case path == "/admin/data/friends" && r.Method == "GET":
		value, err := communityStore.Friends(r.Context(), false)
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"friends": value})
	case path == "/admin/data/friends" && r.Method == "POST":
		var input community.Friend
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
		_, value, err := communityStore.CreateFriend(r.Context(), input, false)
		if err != nil {
			s.fail(w, err)
			return
		}
		s.wakeFriendJobs()
		JSON(w, 201, map[string]any{"friends": value})
	case strings.HasPrefix(path, "/admin/data/friends/") && (r.Method == "PUT" || r.Method == "DELETE"):
		parts := strings.Split(strings.TrimPrefix(path, "/admin/data/friends/"), "/")
		if len(parts) > 2 || parts[0] == "" {
			JSON(w, 404, map[string]string{"error": "接口不存在"})
			return
		}
		var input struct {
			community.Friend
			Offset int `json:"offset"`
		}
		action := "update"
		if r.Method == "DELETE" {
			action = "delete"
		} else {
			if err := body(w, r, &input); err != nil {
				s.fail(w, err)
				return
			}
			if len(parts) == 2 {
				action = parts[1]
			}
		}
		if action == "avatar-refresh" && r.Method == "PUT" {
			if s.FriendAvatars != nil {
				communityStore.StoreAvatar = s.FriendAvatars.Save
			}
			changed, err := communityStore.RefreshAvatar(r.Context(), parts[0])
			if err != nil {
				s.fail(w, err)
				return
			}
			value, err := communityStore.Friends(r.Context(), false)
			if err != nil {
				s.fail(w, err)
				return
			}
			JSON(w, 200, map[string]any{"friends": value, "avatarChanged": changed})
			return
		}
		if action == "auto-review" && r.Method == "PUT" {
			if err := communityStore.EnqueueFriend(r.Context(), parts[0]); err != nil {
				s.fail(w, err)
				return
			}
			s.wakeFriendJobs()
			value, err := communityStore.Friends(r.Context(), false)
			if err != nil {
				s.fail(w, err)
				return
			}
			JSON(w, 200, map[string]any{"friends": value, "queued": true})
			return
		}
		value, err := communityStore.UpdateFriend(r.Context(), parts[0], input.Friend, action, input.Offset)
		if err != nil {
			s.fail(w, err)
			return
		}
		s.wakeFriendJobs()
		JSON(w, 200, map[string]any{"friends": value})
	case path == "/admin/data/feedback" && r.Method == "GET":
		page := 1
		if q := r.URL.Query().Get("page"); q != "" {
			var err error
			page, err = strconv.Atoi(q)
			if err != nil {
				s.fail(w, errors.New("页码无效"))
				return
			}
		}
		value, err := communityStore.Feedback(r.Context(), page)
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, value)
	case strings.HasPrefix(path, "/admin/data/feedback/") && (r.Method == "PUT" || r.Method == "DELETE"):
		var input struct {
			Status string `json:"status"`
		}
		if r.Method == "PUT" {
			if err := body(w, r, &input); err != nil {
				s.fail(w, err)
				return
			}
		}
		if err := communityStore.UpdateFeedback(r.Context(), strings.TrimPrefix(path, "/admin/data/feedback/"), input.Status, r.Method == "DELETE"); err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]bool{"ok": true})

	default:
		JSON(w, 404, map[string]string{"error": "接口不存在"})
	}
}
