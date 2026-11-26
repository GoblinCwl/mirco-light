package httpapi

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"goblincwl/quartz-server/internal/starbud"
	"goblincwl/quartz-server/internal/visitors"
)

func (s *Server) chatWithStarbud(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != s.Origin || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		JSON(w, 403, map[string]string{"error": "请从微光集发起对话"})
		return
	}
	user, ip := s.starbudIdentity(w, r)
	if user == "" {
		return
	}
	var input starbud.Input
	r.Body = http.MaxBytesReader(w, r.Body, 128<<10)
	if err := body(w, r, &input); err != nil {
		JSON(w, 400, map[string]string{"error": "聊天消息格式无效或过大"})
		return
	}
	input, err := starbud.Prepare(input, s.Origin)
	if err != nil {
		JSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	if input.Unlock != nil {
		if r.Header.Get("Accept") != starbud.StreamType || !input.Unlock.Unlocked || !s.starbudUnlockMatches(r.Context(), input) {
			JSON(w, 400, map[string]string{"error": "当前页面的解锁状态已变化，请重新打开页面后再试"})
			return
		}
		input.TurnID = rand.Text()
	}
	input.ClientIP = visitors.NormalizeIP(clientIP(r))
	if r.Header.Get("Accept") == starbud.StreamType {
		s.streamStarbud(w, r, user, ip, input)
		return
	}
	reply, err := s.Starbud.Reply(r.Context(), time.Now(), user, ip, input)
	if err != nil {
		s.starbudChatError(w, err)
		return
	}
	JSON(w, 200, map[string]string{"reply": reply})
}

const starbudUnavailable = "星芽暂时无法回复，请稍后再试"

func (s *Server) starbudChatError(w http.ResponseWriter, err error) {
	if errors.Is(err, starbud.ErrLimit) {
		JSON(w, 429, map[string]string{"error": "今天的对话次数已用完，北京时间零点恢复"})
		return
	}
	if !errors.Is(err, starbud.ErrUnavailable) {
		s.Log.Error("starbud chat failed", "error", err)
	}
	JSON(w, 503, map[string]string{"error": starbudUnavailable})
}

func (s *Server) streamStarbud(w http.ResponseWriter, r *http.Request, user, ip string, input starbud.Input) {
	var reads *starbudReadTurn
	if input.TurnID != "" {
		reads = &starbudReadTurn{user: user, ip: ip, pending: make(map[string]bool)}
		s.starbudReads.Store(input.TurnID, reads)
		defer s.starbudReads.Delete(input.TurnID)
	}
	started := false
	control := http.NewResponseController(w)
	send := func(event starbud.StreamEvent) error {
		if event.Type == "read_request" {
			if reads == nil || !reads.register(event) {
				return starbud.ErrUnavailable
			}
			event.TurnID = input.TurnID
		}
		if !started {
			w.Header().Set("Content-Type", starbud.StreamType+"; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store, no-transform")
			w.Header().Set("X-Accel-Buffering", "no")
			started = true
		}
		data, err := json.Marshal(event)
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", data); err != nil {
			return err
		}
		return control.Flush()
	}
	err := s.Starbud.StreamReply(r.Context(), time.Now(), user, ip, input, send)
	if err == nil || r.Context().Err() != nil {
		return
	}
	if started {
		_ = send(starbud.StreamEvent{Type: "error", Text: starbudUnavailable})
	} else {
		s.starbudChatError(w, err)
	}
}

func (s *Server) starbudIdentity(w http.ResponseWriter, r *http.Request) (user, ip string) {
	if s.Starbud == nil || s.Visitors == nil {
		JSON(w, 503, map[string]string{"error": "星芽暂时无法回复，请稍后再试"})
		return "", ""
	}
	address := visitors.NormalizeIP(clientIP(r))
	user = s.Visitors.Identity(address, r.Header.Get("X-Visitor-ID"))
	if user == "" {
		JSON(w, 400, map[string]string{"error": "无法识别当前访客，请刷新后重试"})
		return "", ""
	}
	return user, s.Visitors.IPIdentity(address)
}

func (s *Server) starbudQuota(w http.ResponseWriter, r *http.Request) {
	if origin := r.Header.Get("Origin"); origin != "" && origin != s.Origin || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		JSON(w, 403, map[string]string{"error": "请从微光集查询对话次数"})
		return
	}
	user, ip := s.starbudIdentity(w, r)
	if user == "" {
		return
	}
	quota, err := s.Starbud.Quota(r.Context(), time.Now(), user, ip)
	if err != nil {
		s.Log.Error("starbud quota failed", "error", err)
		JSON(w, 503, map[string]string{"error": "暂时无法查询剩余对话次数"})
		return
	}
	JSON(w, 200, quota)
}
