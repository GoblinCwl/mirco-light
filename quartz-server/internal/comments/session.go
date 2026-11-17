package comments

import (
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/secretbox"
	"gopkg.in/yaml.v3"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type cachedSession struct {
	Key   string `json:"key"`
	Token string `json:"token"`
}
type sessionState struct {
	Sessions       map[string]cachedSession `json:"sessions"`
	BlockedKey     string                   `json:"blockedKey,omitempty"`
	BlockedUntil   time.Time                `json:"blockedUntil,omitempty"`
	BlockedForever bool                     `json:"blockedForever,omitempty"`
}

// SessionStore serializes backend/browser login exchanges and encrypts their
// separate tokens with the existing site encryption key.
type SessionStore struct {
	Directory string
	Key       []byte
	mu        sync.Mutex
	loaded    bool
	state     sessionState
}

func (s *SessionStore) load() error {
	if s.loaded {
		return nil
	}
	s.state = sessionState{Sessions: map[string]cachedSession{}}
	if s.Directory != "" {
		raw, err := os.ReadFile(filepath.Join(s.Directory, "artalk-sessions.json"))
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return errors.New("读取评论登录缓存失败")
		}
		if err == nil {
			var envelope secretbox.Envelope
			if json.Unmarshal(raw, &envelope) != nil {
				return errors.New("评论登录缓存格式无效")
			}
			plain, err := secretbox.Open(envelope, s.Key, []byte("quartz:artalk-sessions:v1"))
			if err != nil || json.Unmarshal([]byte(plain), &s.state) != nil {
				return errors.New("解密评论登录缓存失败")
			}
		}
	}
	if s.state.Sessions == nil {
		s.state.Sessions = map[string]cachedSession{}
	}
	s.loaded = true
	return nil
}
func (s *SessionStore) save() error {
	if s.Directory == "" {
		return nil
	}
	plain, err := json.Marshal(s.state)
	if err != nil {
		return err
	}
	sealed, err := secretbox.Seal(string(plain), s.Key, []byte("quartz:artalk-sessions:v1"))
	if err != nil {
		return err
	}
	raw, err := json.Marshal(sealed)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(s.Directory, 0700); err != nil {
		return errors.New("创建评论登录缓存目录失败")
	}
	file, err := os.CreateTemp(s.Directory, ".artalk-session-*")
	if err != nil {
		return errors.New("保存评论登录缓存失败")
	}
	defer os.Remove(file.Name())
	_, writeErr := file.Write(raw)
	syncErr := file.Sync()
	closeErr := file.Close()
	if errors.Join(writeErr, syncErr, closeErr) != nil {
		return errors.New("保存评论登录缓存失败")
	}
	if err = os.Rename(file.Name(), filepath.Join(s.Directory, "artalk-sessions.json")); err != nil {
		return errors.New("保存评论登录缓存失败")
	}
	return nil
}

// Non-expiring captcha counters require manual verification rather than retries.
func CaptchaReset(filename string) time.Duration {
	raw, err := os.ReadFile(filename)
	if err != nil {
		return time.Minute
	}
	var config struct {
		Captcha struct {
			Always bool `yaml:"always"`
			Reset  *int `yaml:"action_reset"`
		} `yaml:"captcha"`
	}
	if yaml.Unmarshal(raw, &config) != nil {
		return time.Minute
	}
	if config.Captcha.Always {
		return -1
	}
	if config.Captcha.Reset == nil {
		return time.Minute
	}
	if *config.Captcha.Reset < 0 {
		return -1
	}
	return time.Duration(*config.Captcha.Reset+1) * time.Second
}
