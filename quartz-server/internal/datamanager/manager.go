package datamanager

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/journal"
	"strconv"
	"strings"
	"time"
)

// This explicit registry is the only entry point. Auth, credentials and
// third-party databases can never be reached by a caller-supplied table name.
type definition struct{ ID, Table, Group, Title string }

var definitions = []definition{{"adapter-snapshots", "adapter_snapshots", "适配缓存", "公开适配快照"}, {"content-meta", "content_meta", "内容索引", "索引与订阅版本"}, {"content-sources", "content_sources", "内容索引", "来源同步状态"}, {"share-identities", "share_identities", "分享", "分享稳定标识"}, {"friends", "friends", "友链", "友链资料"}, {"feedback", "feedback", "问题反馈", "反馈记录"}, {"visitors", "visitors", "彗星", "来访者"}, {"daily-visitors", "daily_visitors", "彗星", "每日来访明细"}, {"visitor-fixtures", "visitor_fixtures", "彗星", "测试数据标记"}, {"videos", "videos", "视频", "视频资料"}, {"video-meta", "video_meta", "视频", "系列、分集与用户缓存"}, {"video-assets", "video_assets", "视频", "本地图片"}, {"repo-snapshots", "repo_snapshots", "仓库", "用户与活动缓存"}, {"repo-avatar", "repo_avatar", "仓库", "本地头像"}, {"journal", "journal", "运行纪事", "最近十条纪事"}, {"content-index", "content", "内容索引", "四类内容"}}

//go:embed labels.json
var labelsJSON []byte

func labels() map[string]string { var v map[string]string; json.Unmarshal(labelsJSON, &v); return v }

type Field struct {
	Name     string `json:"name"`
	Label    string `json:"label"`
	Type     string `json:"type"`
	Required bool   `json:"required"`
	Primary  int    `json:"primary"`
	Default  any    `json:"default"`
	Auto     bool   `json:"-"`
	JSON     bool   `json:"-"`
}
type Manager struct {
	DB *sql.DB
}

func resolve(id string) (definition, error) {
	for _, d := range definitions {
		if d.ID == id {
			return d, nil
		}
	}
	return definition{}, errors.New("数据类别不存在")
}
func quote(name string) string { return "`" + name + "`" }
func (m Manager) fields(ctx context.Context, id string) (definition, []Field, error) {
	d, err := resolve(id)
	if err != nil {
		return d, nil, err
	}
	rows, err := m.DB.QueryContext(ctx, "SELECT COLUMN_NAME,DATA_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION", d.Table)
	if err != nil {
		return d, nil, err
	}
	defer rows.Close()
	out := []Field{}
	primary := 0
	names := labels()
	for rows.Next() {
		var name, dataType, nullable, extra, key string
		var defaultValue *string
		if err = rows.Scan(&name, &dataType, &nullable, &defaultValue, &extra, &key); err != nil {
			return d, nil, err
		}
		if strings.Contains(strings.ToLower(extra), "generated") {
			continue
		}
		field := Field{JSON: dataType == "json", Name: name, Label: names[name], Type: "text", Required: nullable == "NO", Default: nil, Auto: strings.Contains(extra, "auto_increment")}
		if defaultValue != nil {
			field.Default = *defaultValue
		}
		if field.Label == "" {
			field.Label = name
		}
		if strings.Contains(dataType, "blob") {
			field.Type = "file"
		} else if strings.Contains(dataType, "int") || strings.Contains(dataType, "decimal") || dataType == "double" || dataType == "float" {
			field.Type = "number"
		}
		if key == "PRI" {
			primary++
			field.Primary = primary
		}
		if field.Auto || field.Primary > 0 && field.Type == "number" {
			field.Required = false
		}
		out = append(out, field)
	}
	return d, out, rows.Err()
}
func (m Manager) Catalog(ctx context.Context) ([]map[string]any, error) {
	out := []map[string]any{}
	for _, d := range definitions {
		_, fields, err := m.fields(ctx, d.ID)
		if err != nil {
			return nil, err
		}
		row := map[string]any{"id": d.ID, "group": d.Group, "title": d.Title, "fields": fields}
		if d.ID == "journal" {
			row["limit"] = 10
		}
		out = append(out, row)
	}
	return out, nil
}
func where(fields []Field, key map[string]any) (string, []any, error) {
	clauses := []string{}
	args := []any{}
	for _, f := range fields {
		if f.Primary == 0 {
			continue
		}
		value, ok := key[f.Name]
		if !ok || value == nil {
			return "", nil, errors.New("记录标识无效")
		}
		clauses = append(clauses, quote(f.Name)+"=?")
		args = append(args, value)
	}
	if len(key) != len(args) || len(args) == 0 {
		return "", nil, errors.New("记录标识无效")
	}
	return strings.Join(clauses, " AND "), args, nil
}
func wire(rows *sql.Rows, fields []Field, short bool) ([]map[string]any, error) {
	out := []map[string]any{}
	for rows.Next() {
		values := make([]any, len(fields))
		dest := make([]any, len(fields))
		for i := range values {
			dest[i] = &values[i]
		}
		if err := rows.Scan(dest...); err != nil {
			return nil, err
		}
		row := map[string]any{}
		for i, f := range fields {
			value := values[i]
			if value != nil {
				if f.Type == "file" {
					size := 0
					switch v := value.(type) {
					case []byte:
						size = len(v)
					case int64:
						size = int(v)
					}
					value = map[string]any{"blob": true, "bytes": size}
				} else if v, ok := value.([]byte); ok {
					value = string(v)
				}
				if short && f.Type == "text" && f.Primary == 0 {
					if s, ok := value.(string); ok {
						r := []rune(s)
						if len(r) > 240 {
							value = string(r[:240])
						}
					}
				}
			}
			row[f.Name] = value
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
func selectFields(fields []Field, short bool) string {
	out := []string{}
	for _, f := range fields {
		column := quote(f.Name)
		if short && f.Type == "file" {
			column = "OCTET_LENGTH(" + column + ")"
		}
		out = append(out, column)
	}
	return strings.Join(out, ",")
}
func (m Manager) Read(ctx context.Context, id string, key map[string]any) (map[string]any, error) {
	d, fields, err := m.fields(ctx, id)
	if err != nil {
		return nil, err
	}
	match, args, err := where(fields, key)
	if err != nil {
		return nil, err
	}
	rows, err := m.DB.QueryContext(ctx, "SELECT "+selectFields(fields, false)+" FROM "+quote(d.Table)+" WHERE "+match, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records, err := wire(rows, fields, false)
	if err != nil {
		return nil, err
	}
	if len(records) != 1 {
		return nil, errors.New("记录不存在，请刷新列表")
	}
	return records[0], nil
}
func (m Manager) List(ctx context.Context, id string, page int, query string) (map[string]any, error) {
	if page < 1 {
		return nil, errors.New("页码无效")
	}
	d, fields, err := m.fields(ctx, id)
	if err != nil {
		return nil, err
	}
	query = strings.TrimSpace(query)
	if len([]rune(query)) > 120 {
		query = string([]rune(query)[:120])
	}
	filter := ""
	args := []any{}
	if query != "" {
		clauses := []string{}
		for _, f := range fields {
			if f.Type != "file" {
				clauses = append(clauses, "LOCATE(LOWER(?),LOWER(CAST("+quote(f.Name)+" AS CHAR)))>0")
				args = append(args, query)
			}
		}
		filter = " WHERE " + strings.Join(clauses, " OR ")
	}
	var total int
	if err = m.DB.QueryRowContext(ctx, "SELECT count(*) FROM "+quote(d.Table)+filter, args...).Scan(&total); err != nil {
		return nil, err
	}
	pages := (total + 24) / 25
	if pages < 1 {
		pages = 1
	}
	if page > pages {
		page = pages
	}
	ordering := map[string]string{"friends": "position,id", "feedback": "created_at DESC,id", "visitors": "last_seen DESC,meteor_id", "daily-visitors": "day DESC,identity", "videos": "published_at DESC,bvid", "journal": "completed_at DESC,id DESC"}
	order := ordering[id]
	if order == "" {
		primary := []string{}
		for _, f := range fields {
			if f.Primary > 0 {
				primary = append(primary, quote(f.Name))
			}
		}
		order = strings.Join(primary, ",")
	}
	rows, err := m.DB.QueryContext(ctx, "SELECT "+selectFields(fields, true)+" FROM "+quote(d.Table)+filter+" ORDER BY "+order+" LIMIT 25 OFFSET ?", append(args, (page-1)*25)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values, err := wire(rows, fields, true)
	if err != nil {
		return nil, err
	}
	records := []map[string]any{}
	for _, value := range values {
		key := map[string]any{}
		for _, f := range fields {
			if f.Primary > 0 {
				key[f.Name] = value[f.Name]
			}
		}
		records = append(records, map[string]any{"key": key, "values": value})
	}
	return map[string]any{"page": page, "pages": pages, "total": total, "records": records}, nil
}
func (m Manager) Blob(ctx context.Context, id string, key map[string]any, column string) ([]byte, string, error) {
	d, fields, err := m.fields(ctx, id)
	if err != nil {
		return nil, "", err
	}
	found := false
	hasMime := false
	for _, f := range fields {
		if f.Name == column && f.Type == "file" {
			found = true
		}
		if f.Name == "mime" {
			hasMime = true
		}
	}
	if !found {
		return nil, "", errors.New("文件字段不存在")
	}
	match, args, err := where(fields, key)
	if err != nil {
		return nil, "", err
	}
	mimeExpr := "'application/octet-stream'"
	if hasMime {
		mimeExpr = "mime"
	}
	var data []byte
	var mime *string
	if err = m.DB.QueryRowContext(ctx, "SELECT "+quote(column)+","+mimeExpr+" FROM "+quote(d.Table)+" WHERE "+match, args...).Scan(&data, &mime); err != nil || data == nil {
		return nil, "", errors.New("文件不存在")
	}
	if mime == nil {
		return data, "application/octet-stream", nil
	}
	return data, *mime, nil
}
func (m Manager) Save(ctx context.Context, id string, values, key map[string]any) (map[string]any, error) {
	d, fields, err := m.fields(ctx, id)
	if err != nil {
		return nil, err
	}
	if values == nil {
		return nil, errors.New("记录格式无效")
	}
	known := map[string]Field{}
	for _, f := range fields {
		known[f.Name] = f
	}
	for name := range values {
		if _, ok := known[name]; !ok {
			return nil, errors.New("包含不支持的字段")
		}
	}
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if id == "daily-visitors" || id == "visitor-fixtures" {
		identity := values["identity"]
		if key != nil {
			identity = key["identity"]
		}
		var parent string
		if err = tx.QueryRowContext(ctx, "SELECT identity FROM visitors WHERE identity=? FOR SHARE", identity).Scan(&parent); err != nil {
			return nil, errors.New("对应的来访者不存在")
		}
	}
	if id == "friends" || id == "journal" || id == "content-index" {
		lock := id
		if strings.HasPrefix(id, "content-") {
			lock = "content"
		}
		var held string
		if err = tx.QueryRowContext(ctx, "SELECT name FROM resource_locks WHERE name=? FOR UPDATE", lock).Scan(&held); err != nil {
			return nil, err
		}
	}
	row := map[string]any{}
	if key != nil {
		match, args, err := where(fields, key)
		if err != nil {
			return nil, err
		}
		rows, err := tx.QueryContext(ctx, "SELECT "+selectFields(fields, false)+" FROM "+quote(d.Table)+" WHERE "+match+" FOR UPDATE", args...)
		if err != nil {
			return nil, err
		}
		records, err := wire(rows, fields, false)
		rows.Close()
		if err != nil {
			return nil, err
		}
		if len(records) != 1 {
			return nil, errors.New("记录不存在，请刷新列表")
		}
		old := records[0]
		for name, value := range old {
			row[name] = value
		}
		for name, value := range key {
			if replacement, ok := values[name]; ok && fmt.Sprint(replacement) != fmt.Sprint(value) {
				return nil, errors.New("记录标识不可修改")
			}
		}
	}
	if id == "friends" {
		for _, key := range []string{"review_result", "review_checked_at", "health_failures", "health_checked_on", "health_error"} {
			if _, provided := values[key]; provided {
				return nil, errors.New("审核结果由审核流程维护")
			}
		}
		if value, present := values["url"]; present && value != row["url"] || (values["status"] == "展示中" || values["status"] == "待审核") && values["status"] != row["status"] {
			row["health_failures"] = 0
			row["health_checked_on"] = ""
			row["health_error"] = ""
		}
		for _, key := range []string{"url", "backlink_url"} {
			if value, provided := values[key]; provided && value != row[key] {
				row["review_result"] = ""
				row["review_checked_at"] = ""
			}
		}
		if value, provided := values["status"]; provided && key != nil && value != row["status"] {
			row["review_result"] = "人工审核：" + fmt.Sprint(value)
			row["review_checked_at"] = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		}
		if _, provided := values["latest_update"]; provided {
			return nil, errors.New("最近更新时间由 RSS 任务自动维护")
		}
		if value, provided := values["rss_url"]; provided && value != row["rss_url"] {
			row["latest_update"] = ""
		}
	}
	for name, value := range values {
		row[name] = value
	}
	// Reject malformed structured input before passing it to MySQL.
	for _, f := range fields {
		if f.JSON && row[f.Name] != nil {
			raw, ok := row[f.Name].(string)
			if !ok || !json.Valid([]byte(raw)) {
				return nil, fmt.Errorf("%s 需要有效的 JSON", f.Label)
			}
		}
	}
	now := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if key == nil {
		defaults := map[string]map[string]any{"friends": {"id": uuid.NewString(), "example": 0, "position": 0, "status": "待审核"}, "feedback": {"id": uuid.NewString(), "status": "待处理", "user_agent": "", "created_at": now}, "visitors": {"identity": strings.ReplaceAll(uuid.NewString()+uuid.NewString(), "-", ""), "meteor_id": strings.ReplaceAll(uuid.NewString(), "-", "")[:24], "first_seen": now, "last_seen": now}, "videos": {"fetched_at": now, "cover": "", "description": "", "duration": 0, "play": 0, "danmaku": 0, "comment_count": 0}, "journal": {"completed_at": now}, "adapter-snapshots": {"updated_at": now, "value": "{}"}, "content-index": {"id": uuid.NewString(), "content": "", "description": "", "tags": "[]", "links": "[]", "published_at": now, "updated_at": now, "encrypted": 0, "revision": "", "event_revision": "", "search_text": "", "extra": "{}"}}
		for name, value := range defaults[id] {
			if row[name] == nil || row[name] == "" {
				row[name] = value
			}
		}
	}
	for _, f := range fields {
		value := row[f.Name]
		if key == nil && f.Auto && (value == nil || value == "") {
			delete(row, f.Name)
			continue
		}
		if f.Type == "file" {
			if object, ok := value.(map[string]any); ok {
				if object["blob"] == true {
					delete(row, f.Name)
					continue
				}
				encoded, ok := object["base64"].(string)
				if !ok || len(encoded) > 700000 {
					return nil, errors.New("图片格式无效或超过 512 KB")
				}
				data, err := base64.StdEncoding.Strict().DecodeString(encoded)
				if err != nil || len(data) > 512<<10 {
					return nil, errors.New("图片格式无效或超过 512 KB")
				}
				row[f.Name] = data
				if _, exists := known["hash"]; exists {
					hash := sha256.Sum256(data)
					row["hash"] = hex.EncodeToString(hash[:])
				}
			}
		}
		if f.Required && value == nil && f.Default == nil && !f.Auto && !(f.Name == "id" && id == "repo-avatar") {
			return nil, fmt.Errorf("请填写%s", f.Label)
		}
		if f.Type == "number" && value != nil {
			switch n := value.(type) {
			case float64:
				if n != float64(int64(n)) {
					return nil, fmt.Errorf("%s需要填写整数", f.Label)
				}
			case int, int64:
			default:
				if _, err = strconv.ParseInt(fmt.Sprint(value), 10, 64); err != nil {
					return nil, fmt.Errorf("%s需要填写数字", f.Label)
				}
			}
		}
	}
	if err = validate(id, row); err != nil {
		return nil, err
	}
	if id == "friends" && key == nil {
		var count int
		if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM friends").Scan(&count); err != nil {
			return nil, err
		}
		if count >= 150 {
			return nil, errors.New("最多可添加 150 个站点")
		}
	}
	if id == "repo-avatar" && key == nil && row["id"] == nil {
		var next int64
		if err = tx.QueryRowContext(ctx, "SELECT coalesce(max(id),0)+1 FROM repo_avatar").Scan(&next); err != nil {
			return nil, err
		}
		row["id"] = next
	}
	names := []string{}
	args := []any{}
	for _, f := range fields {
		if value, ok := row[f.Name]; ok {
			if key != nil && f.Primary > 0 {
				continue
			}
			names = append(names, f.Name)
			args = append(args, value)
		}
	}
	if key != nil {
		match, whereArgs, err := where(fields, key)
		if err != nil {
			return nil, err
		}
		changes := []string{}
		for _, name := range names {
			changes = append(changes, quote(name)+"=?")
		}
		if len(changes) > 0 {
			if _, err = tx.ExecContext(ctx, "UPDATE "+quote(d.Table)+" SET "+strings.Join(changes, ",")+" WHERE "+match, append(args, whereArgs...)...); err != nil {
				return nil, err
			}
		}
	} else {
		quoted := []string{}
		for _, name := range names {
			quoted = append(quoted, quote(name))
		}
		result, err := tx.ExecContext(ctx, "INSERT INTO "+quote(d.Table)+"("+strings.Join(quoted, ",")+") VALUES("+strings.TrimSuffix(strings.Repeat("?,", len(names)), ",")+")", args...)
		if err != nil {
			return nil, err
		}
		for _, f := range fields {
			if f.Auto && row[f.Name] == nil {
				row[f.Name], err = result.LastInsertId()
				if err != nil {
					return nil, err
				}
			}
		}
	}
	if id == "visitors" {
		date, err := time.Parse(time.RFC3339Nano, fmt.Sprint(row["last_seen"]))
		if err != nil {
			return nil, err
		}
		day := date.In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")
		if _, err = tx.ExecContext(ctx, "INSERT IGNORE INTO daily_visitors(day,identity) VALUES(?,?)", day, row["identity"]); err != nil {
			return nil, err
		}
	}
	if id == "daily-visitors" {
		table, column := "visitors", "identity"
		var exists int
		if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM "+quote(table)+" WHERE "+quote(column)+"=?", row[column]).Scan(&exists); err != nil {
			return nil, err
		}
		if exists == 0 {
			return nil, errors.New("对应记录不存在")
		}
	}
	if id == "journal" {
		if err = journal.Trim(ctx, tx); err != nil {
			return nil, err
		}
	}
	if id == "friends" {
		if err = community.EnqueueFriendTx(ctx, tx, fmt.Sprint(row["id"])); err != nil {
			return nil, err
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	resultKey := map[string]any{}
	for _, f := range fields {
		if f.Primary > 0 {
			resultKey[f.Name] = row[f.Name]
		}
	}
	return map[string]any{"key": resultKey}, nil
}
func (m Manager) Remove(ctx context.Context, id string, key map[string]any) error {
	d, fields, err := m.fields(ctx, id)
	if err != nil {
		return err
	}
	if _, err = m.Read(ctx, id, key); err != nil {
		return err
	}
	match, args, err := where(fields, key)
	if err != nil {
		return err
	}
	tx, err := m.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if id == "visitors" {
		var identity string
		if err = tx.QueryRowContext(ctx, "SELECT identity FROM visitors WHERE identity=? FOR UPDATE", key["identity"]).Scan(&identity); err != nil {
			return err
		}

	}
	if id == "videos" {
		if _, err = tx.ExecContext(ctx, "DELETE FROM video_meta WHERE `key`=?", "detail:"+fmt.Sprint(key["bvid"])); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM "+quote(d.Table)+" WHERE "+match, args...); err != nil {
		return err
	}
	return tx.Commit()
}
