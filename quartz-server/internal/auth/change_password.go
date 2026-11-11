package auth

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"unicode/utf16"
)

// ChangePassword proves both existing factors, then atomically replaces the
// password and all sessions. The requesting browser receives a fresh session.
func (s *Service) ChangePassword(ctx context.Context, ip string, input Input) (map[string]any, error) {
	if err := s.attempt(ctx, ip); err != nil {
		return nil, err
	}
	if len(utf16.Encode([]rune(input.NewPassword))) < 12 || len(input.NewPassword) > 4096 {
		return nil, failure(400, "新密码需至少 12 个字符，且不超过 4096 字节")
	}
	if input.NewPassword == input.Password {
		return nil, failure(400, "新密码不能与当前密码相同")
	}
	password, err := s.passwordProof(ctx, input)
	if err != nil {
		return nil, err
	}
	salt, err := randomHex(24)
	if err != nil {
		return nil, err
	}
	key, err := s.derive(ctx, input.NewPassword, salt)
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
		return nil, failure(409, "请先绑定验证器")
	}
	if err = s.verifyFactor(factor, input); err != nil {
		return nil, err
	}
	current.Salt, current.Hash = salt, hex.EncodeToString(key)
	raw, err := json.Marshal(current)
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE auth_state SET value=? WHERE `key`='password'", string(raw)); err != nil {
		return nil, err
	}
	raw, err = json.Marshal(factor)
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE auth_state SET value=? WHERE `key`='totp'", string(raw)); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM auth_sessions"); err != nil {
		return nil, err
	}
	result, err := s.session(ctx, tx, ip, current, factor)
	if err == nil {
		clear(s.pending)
	}
	return result, err
}
