package auth

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"golang.org/x/crypto/scrypt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

type Password struct {
	Salt        string `json:"salt"`
	Hash        string `json:"hash"`
	FactorEpoch string `json:"factorEpoch"`
}
type Factor struct {
	Version        int      `json:"version"`
	Generation     string   `json:"generation"`
	Secret         Sealed   `json:"secret"`
	LastCounter    int64    `json:"lastCounter"`
	RecoveryHashes []string `json:"recoveryHashes"`
	EnabledAt      string   `json:"enabledAt"`
}
type Input struct {
	NewPassword     string `json:"newPassword"`
	Password        string `json:"password"`
	Code            string `json:"code"`
	RecoveryCode    string `json:"recoveryCode"`
	SetupToken      string `json:"setupToken"`
	CompletionToken string `json:"completionToken"`
	Saved           bool   `json:"saved"`
}
type Error struct {
	Message string
	Status  int
}

func (e *Error) Error() string                 { return e.Message }
func failure(status int, message string) error { return &Error{message, status} }

type pending struct {
	IP, Phase, Secret, Version string
	Until                      time.Time
}
type Service struct {
	DB      *sql.DB
	Key     []byte
	Now     func() time.Time
	mu      sync.Mutex
	pending map[string]pending
	slots   chan struct{}
}

func New(db *sql.DB, directory string) (*Service, error) {
	raw, err := os.ReadFile(filepath.Join(directory, "totp.key"))
	if err != nil {
		return nil, fmt.Errorf("read TOTP encryption key: %w", err)
	}
	key, err := hex.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil || len(key) != 32 {
		return nil, errors.New("invalid TOTP encryption key")
	}
	return &Service{DB: db, Key: key, Now: time.Now, pending: map[string]pending{}, slots: make(chan struct{}, 4)}, nil
}

type queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readState(ctx context.Context, q queryer, lock bool) (Password, *Factor, error) {
	var password Password
	var factor *Factor
	var raw string
	suffix := ""
	if lock {
		suffix = " FOR UPDATE"
	}
	err := q.QueryRowContext(ctx, "SELECT value FROM auth_state WHERE `key`='password'"+suffix).Scan(&raw)
	if err == sql.ErrNoRows {
		return password, nil, failure(503, "尚未设置星枢密码，请先在服务器本机设置")
	}
	if err != nil {
		return password, nil, err
	}
	if err = json.Unmarshal([]byte(raw), &password); err != nil {
		return password, nil, err
	}
	err = q.QueryRowContext(ctx, "SELECT value FROM auth_state WHERE `key`='totp'"+suffix).Scan(&raw)
	if err == sql.ErrNoRows {
		return password, nil, nil
	}
	if err != nil {
		return password, nil, err
	}
	if err = json.Unmarshal([]byte(raw), &factor); err != nil {
		return password, nil, err
	}
	return password, factor, nil
}
func version(password Password, factor *Factor) string {
	generation := "unbound"
	if factor != nil {
		generation = factor.Generation
	}
	return digest(password.Hash + ":" + password.FactorEpoch + ":" + generation)
}
func (s *Service) Status(ctx context.Context) (map[string]any, error) {
	_, factor, err := readState(ctx, s.DB, false)
	if e, ok := err.(*Error); ok && e.Status == 503 {
		return map[string]any{"configured": false, "totpEnabled": false}, nil
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"configured": true, "totpEnabled": factor != nil}, nil
}
func (s *Service) CheckSession(ctx context.Context, token string) (bool, error) {
	if len(token) != 64 {
		return false, nil
	}
	var expected string
	err := s.DB.QueryRowContext(ctx, "SELECT version FROM auth_sessions WHERE token_hash=? AND expires_at>?", digest(token), s.Now().UnixMilli()).Scan(&expected)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	password, factor, err := readState(ctx, s.DB, false)
	var missing *Error
	if errors.As(err, &missing) && missing.Status == 503 {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return secureEqual(expected, version(password, factor)), nil
}
func (s *Service) Authenticated(ctx context.Context, token string) bool {
	ok, _ := s.CheckSession(ctx, token)
	return ok
}
func (s *Service) Logout(ctx context.Context, token string) error {
	_, err := s.DB.ExecContext(ctx, "DELETE FROM auth_sessions WHERE token_hash=?", digest(token))
	return err
}
func (s *Service) attempt(ctx context.Context, ip string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	key := digest(ip)
	now := s.Now().UnixMilli()
	// The insert serializes first attempts, too; rejected requests do not extend the window.
	if _, err = tx.ExecContext(ctx, "INSERT INTO auth_attempts(identity,attempts,expires_at) VALUES(?,0,?) ON DUPLICATE KEY UPDATE identity=VALUES(identity)", key, now+900000); err != nil {
		return err
	}
	var count, until int64
	if err = tx.QueryRowContext(ctx, "SELECT attempts,expires_at FROM auth_attempts WHERE identity=? FOR UPDATE", key).Scan(&count, &until); err != nil {
		return err
	}
	if until <= now {
		count = 0
		until = now + 900000
	}
	if count >= 8 {
		return failure(429, "尝试次数较多，请 15 分钟后重试")
	}
	if _, err = tx.ExecContext(ctx, "UPDATE auth_attempts SET attempts=?,expires_at=? WHERE identity=?", count+1, until, key); err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Service) prune() {
	now := s.Now()
	for token, p := range s.pending {
		if !p.Until.After(now) {
			delete(s.pending, token)
		}
	}
}
func (s *Service) session(ctx context.Context, tx *sql.Tx, ip string, password Password, factor *Factor) (map[string]any, error) {
	token, err := randomHex(32)
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO auth_sessions(token_hash,version,expires_at) VALUES(?,?,?)", digest(token), version(password, factor), s.Now().Add(12*time.Hour).UnixMilli()); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM auth_attempts WHERE identity=?", digest(ip)); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	for token, p := range s.pending {
		if p.IP == ip {
			delete(s.pending, token)
		}
	}
	return map[string]any{"ok": true, "token": token}, nil
}
func (s *Service) passwordProof(ctx context.Context, input Input) (Password, error) {
	password, _, err := readState(ctx, s.DB, false)
	if err != nil {
		return Password{}, err
	}
	if input.Password == "" || len(input.Password) > 4096 {
		return Password{}, failure(400, "请输入管理员密码")
	}
	derived, err := s.derive(ctx, input.Password, password.Salt)
	if err != nil {
		return Password{}, err
	}
	if !secureEqual(hex.EncodeToString(derived), password.Hash) {
		return Password{}, failure(401, "密码或动态验证码不正确")
	}
	return password, nil
}
func (s *Service) verifyFactor(factor *Factor, input Input) error {
	if input.RecoveryCode != "" {
		code := normalizeRecovery(input.RecoveryCode)
		if !regexp.MustCompile(`^[a-f0-9]{24}$`).MatchString(code) {
			return failure(401, "密码或恢复码不正确，恢复码只能使用一次")
		}
		found := -1
		for i, h := range factor.RecoveryHashes {
			if secureEqual(digest(code), h) {
				found = i
			}
		}
		if found < 0 {
			return failure(401, "密码或恢复码不正确，恢复码只能使用一次")
		}
		factor.RecoveryHashes = append(factor.RecoveryHashes[:found], factor.RecoveryHashes[found+1:]...)
	} else {
		plain, err := open(factor.Secret, s.Key)
		if err != nil {
			return err
		}
		counter, err := match(plain, input.Code, s.Now().Unix(), factor.LastCounter)
		if err != nil {
			return err
		}
		if counter < 0 {
			return failure(401, "密码或动态验证码不正确，已使用的验证码不可重复使用")
		}
		factor.LastCounter = counter
	}
	return nil
}
func (s *Service) Login(ctx context.Context, ip string, input Input) (map[string]any, error) {
	if err := s.attempt(ctx, ip); err != nil {
		return nil, err
	}
	password, err := s.passwordProof(ctx, input)
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.prune()
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
		return s.enrollment(ip, "setup", password, nil)
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
	return s.session(ctx, tx, ip, password, factor)
}
func (s *Service) proof(token, ip, phase string, password Password, factor *Factor) (pending, error) {
	s.prune()
	p, ok := s.pending[token]
	if !ok || p.IP != ip || p.Phase != phase || p.Version != version(password, factor) {
		return p, failure(401, "验证已过期，请重新开始登录")
	}
	return p, nil
}
func (s *Service) Confirm(ctx context.Context, ip string, input Input) (map[string]any, error) {
	if err := s.attempt(ctx, ip); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	password, factor, err := readState(ctx, tx, true)
	if err != nil {
		return nil, err
	}
	phase := "setup"
	if factor != nil {
		phase = "rebind"
	}
	p, err := s.proof(input.SetupToken, ip, phase, password, factor)
	if err != nil {
		return nil, err
	}
	counter, err := match(p.Secret, input.Code, s.Now().Unix(), -1)
	if err != nil {
		return nil, err
	}
	if counter < 0 {
		return nil, failure(400, "动态验证码不正确，请检查验证器和设备时间")
	}
	encrypted, err := seal(p.Secret, s.Key)
	if err != nil {
		return nil, err
	}
	generation, err := randomHex(16)
	if err != nil {
		return nil, err
	}
	factor = &Factor{Version: 1, Generation: generation, Secret: encrypted, LastCounter: counter, RecoveryHashes: []string{}, EnabledAt: s.Now().UTC().Format(time.RFC3339Nano)}
	codes := []string{}
	for range 10 {
		code, err := randomHex(12)
		if err != nil {
			return nil, err
		}
		groups := []string{}
		for i := 0; i < len(code); i += 4 {
			groups = append(groups, code[i:i+4])
		}
		codes = append(codes, strings.Join(groups, "-"))
		factor.RecoveryHashes = append(factor.RecoveryHashes, digest(code))
	}
	completion, err := randomHex(32)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(factor)
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "INSERT INTO auth_state(`key`,value) VALUES('totp',?) ON DUPLICATE KEY UPDATE value=VALUES(value)", string(raw)); err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM auth_sessions"); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	clear(s.pending)
	s.pending[completion] = pending{ip, "finish", "", version(password, factor), s.Now().Add(5 * time.Minute)}
	return map[string]any{"recoveryCodes": codes, "completionToken": completion}, nil
}
func (s *Service) Finish(ctx context.Context, ip string, input Input) (map[string]any, error) {
	if err := s.attempt(ctx, ip); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	password, factor, err := readState(ctx, tx, true)
	if err != nil {
		return nil, err
	}
	if factor == nil {
		return nil, failure(401, "请重新登录")
	}
	if _, err = s.proof(input.CompletionToken, ip, "finish", password, factor); err != nil {
		return nil, err
	}
	if !input.Saved {
		return nil, failure(400, "请先保存恢复码")
	}
	return s.session(ctx, tx, ip, password, factor)
}

// Cleanup bounds expired persistent sessions and rate-limit windows. It does
// not reset active windows or revoke valid sessions on a process restart.
func (s *Service) Cleanup(ctx context.Context) error {
	now := s.Now().UnixMilli()
	for _, table := range []string{"auth_attempts", "auth_sessions"} {
		if _, err := s.DB.ExecContext(ctx, "DELETE FROM "+table+" WHERE expires_at<=? LIMIT 1000", now); err != nil {
			return err
		}
	}
	s.mu.Lock()
	s.prune()
	s.mu.Unlock()
	return nil
}

// Validate verifies the imported encryption key against the bound factor before
// the server advertises readiness. It does not consume a code or recovery token.
func (s *Service) Validate(ctx context.Context) error {
	password, factor, err := readState(ctx, s.DB, false)
	var missing *Error
	if errors.As(err, &missing) && missing.Status == 503 {
		return nil
	}
	if err != nil {
		return err
	}
	hash, err := hex.DecodeString(password.Hash)
	if err != nil || len(hash) != 64 || password.Salt == "" {
		return errors.New("invalid stored password derivation")
	}
	if factor == nil {
		return nil
	}
	plain, err := open(factor.Secret, s.Key)
	if err != nil {
		return errors.New("bound TOTP cannot be decrypted with the imported key")
	}
	if _, err = totp(plain, 0); err != nil {
		return errors.New("invalid bound TOTP secret")
	}
	if factor.Generation == "" || factor.Version != 1 {
		return errors.New("invalid bound TOTP state")
	}
	return nil
}

func (s *Service) derive(ctx context.Context, password, salt string) ([]byte, error) {
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
		return nil, failure(429, "请求较多，请稍后重试")
	}
	return scrypt.Key([]byte(password), []byte(salt), 16384, 8, 1, 64)
}
