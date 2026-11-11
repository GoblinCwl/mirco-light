package monitoring

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"goblincwl/quartz-server/internal/secretbox"
	"goblincwl/quartz-server/internal/svgicon"
)

type Registry struct {
	DB  *sql.DB
	Key []byte
	tx  *sql.Tx
}
type registryQueries interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (r *Registry) queries() registryQueries {
	if r.tx != nil {
		return r.tx
	}
	return r.DB
}

type ServiceConfig struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Integration  string `json:"integration"`
	Icon         string `json:"icon"`
	Container    string `json:"container"`
	URL          string `json:"url"`
	Strict       bool   `json:"strict"`
	CredentialID string `json:"credentialId"`
	Enabled      bool   `json:"enabled"`
	Order        int    `json:"order"`
}

func (v ServiceConfig) displayIcon() string {
	if v.Icon != "" {
		return v.Icon
	}
	return v.Integration
}

type Credential struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Username   string `json:"username"`
	Header     string `json:"header"`
	Secret     string `json:"secret,omitempty"`
	Configured bool   `json:"configured"`
}

func Integrations() []map[string]any {
	result := []map[string]any{}
	for _, d := range definitions {
		result = append(result, map[string]any{"id": d.id, "name": d.name, "container": d.container, "strict": d.health})
	}
	return result
}

// These addresses are returned only through the authenticated management API.
func IntegrationOptions(values map[string]any) []map[string]any {
	result := Integrations()
	for i, d := range definitions {
		result[i]["url"] = integrationTarget(d, values)
	}
	return result
}
func (r *Registry) Services(ctx context.Context, enabledOnly bool) ([]ServiceConfig, error) {
	query := "SELECT id,name,integration,icon_svg,container_name,http_url,strict_status,COALESCE(credential_id,''),enabled,sort_order FROM monitored_services"
	if enabledOnly {
		query += " WHERE enabled=1"
	}
	query += " ORDER BY sort_order,id"
	rows, err := r.queries().QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []ServiceConfig{}
	for rows.Next() {
		var v ServiceConfig
		if err = rows.Scan(&v.ID, &v.Name, &v.Integration, &v.Icon, &v.Container, &v.URL, &v.Strict, &v.CredentialID, &v.Enabled, &v.Order); err != nil {
			return nil, err
		}
		result = append(result, v)
	}
	return result, rows.Err()
}
func validHTTP(value string) bool {
	u, err := url.Parse(value)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" && u.User == nil && !strings.ContainsAny(value, "\r\n\x00")
}

var containerName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`)

func (r *Registry) SaveService(ctx context.Context, v ServiceConfig, create bool) error {
	v.Name = strings.TrimSpace(v.Name)
	v.URL = strings.TrimSpace(v.URL)
	v.Container = strings.TrimSpace(v.Container)
	v.Icon = strings.TrimSpace(v.Icon)
	if !svgicon.Valid(v.Icon) {
		return errors.New("请填写有效 SVG 图标，不支持脚本、style 或外部资源，最多 16KB")
	}
	if v.Name == "" || len([]rune(v.Name)) > 100 || v.Order < 0 || v.Order > 100000 {
		return errors.New("请填写服务名称和有效排序")
	}
	if v.Integration != "" {
		v.URL = ""
		found := false
		for _, d := range definitions {
			if d.id == v.Integration {
				found = true
				break
			}
		}
		if !found {
			return errors.New("集成服务不存在")
		}
	}
	if v.URL != "" && !validHTTP(v.URL) || len(v.URL) > 2000 || v.URL == "" && v.Integration == "" {
		return errors.New("请填写完整 HTTP 或 HTTPS 检测地址，不能包含账号密码")
	}
	if v.Container != "" && !containerName.MatchString(v.Container) {
		return errors.New("容器名称格式无效")
	}
	var credential any
	if v.CredentialID != "" {
		var exists int
		if err := r.queries().QueryRowContext(ctx, "SELECT COUNT(*) FROM service_credentials WHERE id=?", v.CredentialID).Scan(&exists); err != nil {
			return err
		}
		if exists == 0 {
			return errors.New("认证配置不存在")
		}
		credential = v.CredentialID
	}
	if create {
		_, err := r.queries().ExecContext(ctx, "INSERT INTO monitored_services(id,name,integration,icon_svg,container_name,http_url,strict_status,credential_id,enabled,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)", uuid.NewString(), v.Name, v.Integration, v.Icon, v.Container, v.URL, v.Strict, credential, v.Enabled, v.Order)
		return err
	}
	result, err := r.queries().ExecContext(ctx, "UPDATE monitored_services SET name=?,integration=?,icon_svg=?,container_name=?,http_url=?,strict_status=?,credential_id=?,enabled=?,sort_order=? WHERE id=?", v.Name, v.Integration, v.Icon, v.Container, v.URL, v.Strict, credential, v.Enabled, v.Order, v.ID)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		var count int
		if err = r.queries().QueryRowContext(ctx, "SELECT count(*) FROM monitored_services WHERE id=?", v.ID).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			return errors.New("服务不存在")
		}
	}
	return nil
}
func (r *Registry) DeleteService(ctx context.Context, id string) error {
	tx, err := r.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var credential string
	err = tx.QueryRowContext(ctx, "SELECT COALESCE(credential_id,'') FROM monitored_services WHERE id=?", id).Scan(&credential)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM monitored_services WHERE id=?", id); err != nil {
		return err
	}
	if credential != "" {
		if _, err = tx.ExecContext(ctx, "DELETE FROM service_credentials WHERE id=? AND NOT EXISTS(SELECT 1 FROM monitored_services WHERE credential_id=?)", credential, credential); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (r *Registry) Credentials(ctx context.Context) ([]Credential, error) {
	rows, err := r.queries().QueryContext(ctx, "SELECT id,name,auth_type,username,header_name FROM service_credentials ORDER BY name,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Credential{}
	for rows.Next() {
		var v Credential
		if err = rows.Scan(&v.ID, &v.Name, &v.Type, &v.Username, &v.Header); err != nil {
			return nil, err
		}
		v.Configured = true
		result = append(result, v)
	}
	return result, rows.Err()
}

var headerName = regexp.MustCompile(`^[A-Za-z0-9-]{1,100}$`)

func (r *Registry) SaveCredential(ctx context.Context, v Credential, create bool) error {
	v.Name = strings.TrimSpace(v.Name)
	v.Header = strings.TrimSpace(v.Header)
	if v.Name == "" || len([]rune(v.Name)) > 100 || len(v.Username) > 500 || strings.ContainsAny(v.Username, "\r\n\x00") {
		return errors.New("请填写有效的认证名称与账号")
	}
	if v.Type != "basic" && v.Type != "bearer" && v.Type != "header" {
		return errors.New("请选择认证类型")
	}
	if v.Type == "basic" && (v.Username == "" || strings.Contains(v.Username, ":")) {
		return errors.New("Basic 认证需要有效账号，不能包含冒号")
	}
	if v.Type == "header" && (!headerName.MatchString(v.Header) || strings.EqualFold(v.Header, "Host") || strings.EqualFold(v.Header, "Content-Length") || strings.EqualFold(v.Header, "Connection") || strings.EqualFold(v.Header, "Transfer-Encoding")) {
		return errors.New("请求头名称无效")
	}
	if len(v.Secret) > 16384 || strings.ContainsAny(v.Secret, "\r\n\x00") {
		return errors.New("密钥长度无效或包含换行")
	}
	if create {
		if v.ID == "" {
			v.ID = uuid.NewString()
		}
		if v.Secret == "" {
			return errors.New("请填写密码或密钥")
		}
	}
	var raw string
	if v.Secret != "" {
		envelope, err := secretbox.Seal(v.Secret, r.Key, []byte("quartz:service-credential:"+v.ID))
		if err != nil {
			return err
		}
		encoded, _ := json.Marshal(envelope)
		raw = string(encoded)
	} else {
		var oldType, oldUsername, oldHeader string
		if err := r.queries().QueryRowContext(ctx, "SELECT envelope,auth_type,username,header_name FROM service_credentials WHERE id=?", v.ID).Scan(&raw, &oldType, &oldUsername, &oldHeader); err != nil {
			return err
		}
		if v.Type != oldType || v.Username != oldUsername || v.Header != oldHeader {
			return errors.New("更换认证类型或账号时请重新填写密钥")
		}
	}
	if create {
		_, err := r.queries().ExecContext(ctx, "INSERT INTO service_credentials(id,name,auth_type,username,header_name,envelope) VALUES(?,?,?,?,?,?)", v.ID, v.Name, v.Type, v.Username, v.Header, raw)
		return err
	}
	result, err := r.queries().ExecContext(ctx, "UPDATE service_credentials SET name=?,auth_type=?,username=?,header_name=?,envelope=? WHERE id=?", v.Name, v.Type, v.Username, v.Header, raw, v.ID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		var count int
		if err = r.queries().QueryRowContext(ctx, "SELECT count(*) FROM service_credentials WHERE id=?", v.ID).Scan(&count); err != nil {
			return err
		}
		if count == 0 {
			return errors.New("认证配置不存在")
		}
	}
	return nil
}
func (r *Registry) DeleteCredential(ctx context.Context, id string) error {
	var used int
	if err := r.queries().QueryRowContext(ctx, "SELECT count(*) FROM monitored_services WHERE credential_id=?", id).Scan(&used); err != nil {
		return err
	}
	if used > 0 {
		return errors.New("认证配置仍被服务使用，请先解除关联")
	}
	_, err := r.queries().ExecContext(ctx, "DELETE FROM service_credentials WHERE id=?", id)
	return err
}
func (r *Registry) Authorize(ctx context.Context, id string, request *http.Request) error {
	if id == "" {
		return nil
	}
	var v Credential
	var raw string
	if err := r.queries().QueryRowContext(ctx, "SELECT auth_type,username,header_name,envelope FROM service_credentials WHERE id=?", id).Scan(&v.Type, &v.Username, &v.Header, &raw); err != nil {
		return err
	}
	var envelope secretbox.Envelope
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		return err
	}
	secret, err := secretbox.Open(envelope, r.Key, []byte("quartz:service-credential:"+id))
	if err != nil {
		return err
	}
	switch v.Type {
	case "basic":
		request.SetBasicAuth(v.Username, secret)
	case "bearer":
		request.Header.Set("Authorization", "Bearer "+secret)
	case "header":
		request.Header.Set(v.Header, secret)
	default:
		return errors.New("认证类型无效")
	}
	return nil
}
