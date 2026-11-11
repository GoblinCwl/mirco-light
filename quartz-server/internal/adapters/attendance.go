package adapters

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/emoji"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var chineseDate = regexp.MustCompile(`(\d{4})年(\d{1,2})月(\d{1,2})日\.md$`)
var isoDate = regexp.MustCompile(`(\d{4})-(\d{2})-(\d{2})\.md$`)
var frontmatter = regexp.MustCompile(`(?s)^---\r?\n(.*?)\r?\n---(?:\r?\n|$)`)
var iconLine = regexp.MustCompile(`(?m)^banner_icon:[ \t]*([^\r\n]*)`)
var quotedIcon = regexp.MustCompile(`^(?:"([^"\r\n]*)"|'([^'\r\n]*)')(?:\s+#.*)?$`)
var inlineComment = regexp.MustCompile(`\s+#.*$`)
var htmlComment = regexp.MustCompile(`(?s)<!--.*?-->`)
var htmlTag = regexp.MustCompile(`<[^>]*>`)
var markedAttendance = regexp.MustCompile(`(?s)<!--\s*diary:attendance:start\s*-->(.*?)<!--\s*diary:attendance:end\s*-->`)
var markedWeather = regexp.MustCompile(`(?s)<!--\s*diary:weather:start\s*-->(.*?)<!--\s*diary:weather:end\s*-->`)
var markedDay = regexp.MustCompile(`(?s)<!--\s*diary:day-label:start\s*-->(.*?)<!--\s*diary:day-label:end\s*-->`)
var ordinaryWeekday = regexp.MustCompile(`^(?:[日月火水木金土]曜日|(?:星期|周)[一二三四五六日天])$`)
var holiday = regexp.MustCompile(`国庆节|中秋节|端午节|春节|元旦(?:节)?|清明节|劳动节|五一(?:劳动节)?|儿童节|妇女节|建军节|重阳节|元宵节|七夕节|除夕`)
var attendanceLocation = regexp.MustCompile(`(?:出勤|出差|驻场|外勤|居家|远程)\s*[-—–:：]\s*([^\r\n]+)`)

func limited(value string, max int) string {
	r := []rune(value)
	if len(r) > max {
		r = r[:max]
	}
	return string(r)
}
func marked(pattern *regexp.Regexp, body string) string {
	match := pattern.FindStringSubmatch(body)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(htmlTag.ReplaceAllString(htmlComment.ReplaceAllString(match[1], ""), ""))
}
func AttendanceRecord(filename, body string) map[string]any {
	parts := chineseDate.FindStringSubmatch(filepath.Base(filename))
	if len(parts) == 0 {
		parts = isoDate.FindStringSubmatch(filepath.Base(filename))
	}
	if len(parts) != 4 {
		return nil
	}
	year, _ := strconv.Atoi(parts[1])
	month, _ := strconv.Atoi(parts[2])
	day, _ := strconv.Atoi(parts[3])
	date := fmt.Sprintf("%04d-%02d-%02d", year, month, day)
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return nil
	}
	record := map[string]any{"date": date}
	if head := frontmatter.FindStringSubmatch(body); len(head) > 1 {
		if match := iconLine.FindStringSubmatch(head[1]); len(match) > 1 {
			icon := strings.TrimSpace(match[1])
			if quoted := quotedIcon.FindStringSubmatch(icon); len(quoted) > 2 {
				if strings.HasPrefix(icon, `"`) {
					icon = quoted[1]
				} else {
					icon = quoted[2]
				}
			} else {
				icon = strings.TrimSpace(inlineComment.ReplaceAllString(icon, ""))
			}
			if emoji.Single(icon) {
				record["bannerIcon"] = icon
			}
		}
	}
	weather := marked(markedWeather, body)
	weather = strings.Map(func(r rune) rune {
		if emoji.ExtendedPictographic(r) || r == 0xFE0F || r == 0x200D {
			return -1
		}
		return r
	}, weather)
	weather = limited(strings.Join(strings.Fields(weather), " "), 120)
	if weather != "" {
		record["weather"] = weather
	}
	label := marked(markedDay, body)
	if label != "" && !ordinaryWeekday.MatchString(label) {
		special := limited(strings.TrimSpace(strings.TrimPrefix(label, "🌟")), 40)
		if special != "" {
			record["specialName"] = special
		}
	}
	text := marked(markedAttendance, body)
	holidayName := holiday.FindString(text)
	status := ""
	for _, rule := range [][2]string{{"请假|病假|事假|年假", "leave"}, {"调休|补休", "comp_off"}, {"居家|远程", "remote"}, {"出差", "business_trip"}, {"驻场", "onsite"}, {"外勤", "fieldwork"}, {"出勤", "work"}, {"周末", "weekend"}} {
		if regexp.MustCompile(rule[0]).MatchString(text) {
			status = rule[1]
			break
		}
	}
	if status == "" && (holidayName != "" || strings.Contains(text, "节假日") || strings.Contains(text, "假期")) {
		status = "holiday"
	}
	if status != "" {
		record["status"] = status
	}
	if status == "holiday" && holidayName != "" {
		record["holidayName"] = holidayName
	}
	if status == "work" || status == "business_trip" || status == "onsite" || status == "fieldwork" || status == "remote" {
		if location := attendanceLocation.FindStringSubmatch(text); len(location) > 1 {
			value := limited(strings.TrimSpace(location[1]), 120)
			if value != "" {
				record["location"] = value
			}
		}
	}
	if len(record) == 1 {
		return nil
	}
	return record
}
func (m *Manager) RefreshAttendance(ctx context.Context) error {
	_, err := m.Cache.Get(ctx, "attendance-refresh", 0, false, func(ctx context.Context) (map[string]any, error) {
		records := map[string]map[string]any{}
		err := filepath.WalkDir(m.DiaryDirectory, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if err := ctx.Err(); err != nil {
				return err
			}
			if !entry.Type().IsRegular() || !strings.HasSuffix(entry.Name(), ".md") || strings.Contains(entry.Name(), "sync-conflict") || (!chineseDate.MatchString(entry.Name()) && !isoDate.MatchString(entry.Name())) {
				return nil
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			record := AttendanceRecord(entry.Name(), string(raw))
			if record == nil {
				return nil
			}
			date := text(record["date"])
			if before := records[date]; before != nil && text(before["status"]) != text(record["status"]) {
				return errors.New("conflicting attendance dates")
			}
			records[date] = record
			return nil
		})
		if err != nil {
			return nil, err
		}
		values := []map[string]any{}
		for _, record := range records {
			values = append(values, record)
		}
		sort.Slice(values, func(i, j int) bool { return text(values[i]["date"]) < text(values[j]["date"]) })
		stamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		months := map[string][]map[string]any{}
		for _, record := range values {
			month := text(record["date"])[:7]
			months[month] = append(months[month], record)
		}
		earliest, latest := "2026-07", time.Now().In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01")
		if len(values) > 0 {
			earliest = text(values[0]["date"])[:7]
			if last := text(values[len(values)-1]["date"])[:7]; last > latest {
				latest = last
			}
		}
		result := map[string]any{"earliest": earliest, "latest": latest, "updatedAt": stamp, "stale": false}
		tx, err := m.DB.BeginTx(ctx, nil)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback()
		keys := []string{"attendance"}
		args := []any{}
		write := func(name string, value any) error {
			raw, err := json.Marshal(value)
			if err != nil {
				return err
			}
			_, err = tx.ExecContext(ctx, "INSERT INTO adapter_snapshots(name,value,updated_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_at=VALUES(updated_at)", name, string(raw), stamp)
			return err
		}
		for month, records := range months {
			key := "attendance:" + month
			keys = append(keys, key)
			if err = write(key, map[string]any{"records": records}); err != nil {
				return nil, err
			}
		}
		if err = write("attendance", result); err != nil {
			return nil, err
		}
		for _, key := range keys {
			args = append(args, key)
		}
		if _, err = tx.ExecContext(ctx, "DELETE FROM adapter_snapshots WHERE name LIKE 'attendance:%' AND name NOT IN ("+strings.TrimSuffix(strings.Repeat("?,", len(keys)), ",")+")", args...); err != nil {
			return nil, err
		}
		if err = tx.Commit(); err != nil {
			return nil, err
		}
		return result, nil
	})
	if err != nil {
		if saved, readErr := m.Saved(ctx, "attendance"); readErr == nil && saved != nil {
			saved["stale"] = true
			_ = m.Save(ctx, "attendance", saved)
		}
	}
	return err
}
func (m *Manager) Attendance(ctx context.Context, month string) (map[string]any, error) {
	if parsed, err := time.Parse("2006-01", month); err != nil || parsed.Year() < 1 || parsed.Format("2006-01") != month {
		return nil, errors.New("月份格式必须为 YYYY-MM")
	}
	metadata, err := m.Saved(ctx, "attendance")
	if err != nil {
		return nil, err
	}
	if metadata == nil {
		if err = m.RefreshAttendance(ctx); err != nil {
			return nil, err
		}
		metadata, err = m.Saved(ctx, "attendance")
		if err != nil {
			return nil, err
		}
	}
	snapshot, err := m.Saved(ctx, "attendance:"+month)
	if err != nil {
		return nil, err
	}
	records := any([]any{})
	if snapshot != nil && snapshot["records"] != nil {
		records = snapshot["records"]
	}
	return map[string]any{"month": month, "records": records, "earliest": metadata["earliest"], "latest": metadata["latest"], "updatedAt": metadata["updatedAt"], "stale": metadata["stale"]}, nil
}
