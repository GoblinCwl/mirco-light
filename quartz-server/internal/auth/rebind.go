package auth

import (
	"context"
	"encoding/json"
	"net/url"
	"time"
)

// Caller holds mu. Pending proofs are bound to the current password/factor
// version, client IP and phase, and never replace the active factor themselves.
func (s *Service) enrollment(ip, phase string, password Password, factor *Factor) (map[string]any, error) {
	s.prune()
	if len(s.pending) >= 100 {
		return nil, failure(429, "请求较多，请稍后重试")
	}
	token, err := randomHex(32)
	if err != nil {
		return nil, err
	}
	key, err := secret()
	if err != nil {
		return nil, err
	}
	until := s.Now().Add(5 * time.Minute)
	for token, p := range s.pending {
		if p.IP == ip {
			delete(s.pending, token)
		}
	}
	s.pending[token] = pending{ip, phase, key, version(password, factor), until}
	return map[string]any{"setupRequired": true, "setupToken": token, "secret": key, "expires": until.UnixMilli(), "uri": "otpauth://totp/" + url.PathEscape("微光集:GoblinCwl") + "?secret=" + key + "&issuer=" + url.QueryEscape("微光集") + "&algorithm=SHA1&digits=6&period=30"}, nil
}

// HTTP also requires a current admin session and same-origin POST. Rebinding
// additionally proves password plus the current factor or a one-use recovery code.
func (s *Service) Rebind(ctx context.Context, ip string, input Input) (map[string]any, error) {
	if err := s.attempt(ctx, ip); err != nil {
		return nil, err
	}
	password, err := s.passwordProof(ctx, input)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	current, factor, err := readState(ctx, tx, true)
	if err != nil {
		return nil, err
	}
	if current != password {
		return nil, failure(401, "密码已变更，请重新登录")
	}
	if factor == nil {
		return nil, failure(409, "尚未绑定验证器，请重新登录并完成绑定")
	}
	if err = s.verifyFactor(factor, input); err != nil {
		return nil, err
	}
	raw, err := json.Marshal(factor)
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE auth_state SET value=? WHERE `key`='totp'", string(raw)); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return s.enrollment(ip, "rebind", password, factor)
}
