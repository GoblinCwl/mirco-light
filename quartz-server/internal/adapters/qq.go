package adapters

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

func (m *Manager) QQ(ctx context.Context) (map[string]any, error) {
	value, err := m.Cache.Get(ctx, "qq-status", time.Minute, false, func(ctx context.Context) (map[string]any, error) {
		values, err := m.Settings(ctx)
		if err != nil {
			return nil, err
		}
		base := strings.TrimRight(setting(values, "api.napcat.url", "http://napcat:6099/api"), "/")
		token := text(values["api.napcat.token"])
		if token == "" {
			return nil, errors.New("请在服务接入配置 NapCat Token")
		}
		hash := sha256.Sum256([]byte(token + ".napcat"))
		loginHash := hex.EncodeToString(hash[:])
		key := base + loginHash
		post := func(path string, body any, credential string) (map[string]any, error) {
			headers := map[string]string{}
			if credential != "" {
				headers["Authorization"] = "Bearer " + credential
			}
			value, err := m.request(ctx, "POST", base+path, body, headers)
			if err != nil {
				return nil, err
			}
			result := object(value)
			if result["code"] != float64(0) {
				return nil, errors.New("NapCat request failed")
			}
			return object(result["data"]), nil
		}
		m.napcatMu.Lock()
		if m.napcatKey != key || !time.Now().Before(m.napcatUntil) {
			result, err := post("/auth/login", map[string]any{"hash": loginHash}, "")
			if err != nil {
				m.napcatMu.Unlock()
				return nil, err
			}
			credential := text(result["Credential"])
			if credential == "" {
				m.napcatMu.Unlock()
				return nil, errors.New("NapCat authentication unavailable")
			}
			m.napcatKey = key
			m.napcatToken = credential
			m.napcatUntil = time.Now().Add(40 * time.Minute)
		}
		credential := m.napcatToken
		m.napcatMu.Unlock()
		result, err := post("/Debug/call", map[string]any{"action": "nc_get_user_status", "params": map[string]any{"user_id": setting(values, "profile.qq", "2395025802")}}, credential)
		if err != nil {
			m.napcatMu.Lock()
			if m.napcatKey == key {
				m.napcatUntil = time.Time{}
			}
			m.napcatMu.Unlock()
			return nil, err
		}
		if result["retcode"] != float64(0) || result["status"] != "ok" {
			return nil, errors.New("QQ status unavailable")
		}
		status, _ := object(result["data"])["status"].(float64)
		states := map[int][2]string{10: {"online", "QQ 在线"}, 20: {"offline", "QQ 离线"}, 30: {"away", "QQ 离开"}, 40: {"offline", "QQ 隐身"}, 50: {"busy", "QQ 忙碌"}, 60: {"online", "QQ Q我吧"}, 70: {"busy", "QQ 请勿打扰"}}
		state, ok := states[int(status)]
		if !ok {
			state = [2]string{"unknown", "QQ 状态未知"}
		}
		return map[string]any{"state": state[0], "label": state[1], "updatedAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}, nil
	})
	if err != nil {
		return map[string]any{"state": "unknown", "label": "QQ 状态暂不可用", "updatedAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}, nil
	}
	return value, nil
}
