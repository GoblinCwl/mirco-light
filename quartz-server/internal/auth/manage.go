package auth

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"unicode/utf16"
)

// SetPassword and ResetTOTP are server-local maintenance operations. They are
// deliberately absent from HTTP routing and invalidate every existing session.
func (s *Service) SetPassword(ctx context.Context, password string) error {
	if len(utf16.Encode([]rune(password))) < 12 || len(password) > 4096 {
		return errors.New("密码需至少 12 个字符，且不超过 4096 字节")
	}
	salt, err := randomHex(24)
	if err != nil {
		return err
	}
	key, err := s.derive(ctx, password, salt)
	if err != nil {
		return err
	}
	value, _ := json.Marshal(Password{Salt: salt, Hash: hex.EncodeToString(key)})
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, "INSERT INTO auth_state(`key`,value) VALUES('password',?) ON DUPLICATE KEY UPDATE value=VALUES(value)", string(value)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM auth_sessions"); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM auth_attempts"); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Service) ResetTOTP(ctx context.Context) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	password, _, err := readState(ctx, tx, true)
	if err != nil {
		return err
	}
	password.FactorEpoch, err = randomHex(16)
	if err != nil {
		return err
	}
	raw, _ := json.Marshal(password)
	if _, err = tx.ExecContext(ctx, "UPDATE auth_state SET value=? WHERE `key`='password'", string(raw)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM auth_state WHERE `key`='totp'"); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM auth_sessions"); err != nil {
		return err
	}
	return tx.Commit()
}
