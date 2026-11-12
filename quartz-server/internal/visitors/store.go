package visitors

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/netip"
	"regexp"
	"strings"
	"time"
)

var shanghai = time.FixedZone("Asia/Shanghai", 8*3600)
var browserID = regexp.MustCompile(`(?i)^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$`)
var browserPatterns = []struct {
	pattern *regexp.Regexp
	name    string
}{
	{regexp.MustCompile(`(?i)MicroMessenger/`), "微信"},
	{regexp.MustCompile(`(?i)\bQQ/|\bV1_(?:AND|IPH)_SQ_`), "QQ"},
	{regexp.MustCompile(`(?i)(?:MQQBrowser|QQBrowser)/`), "QQ浏览器"},
	{regexp.MustCompile(`(?i)Edg(?:e|A|iOS)?/`), "Edge"},
	{regexp.MustCompile(`(?i)OPR/|OPiOS/`), "Opera"},
	{regexp.MustCompile(`(?i)SamsungBrowser/`), "Samsung Internet"},
	{regexp.MustCompile(`(?i)UCBrowser/`), "UC浏览器"},
	{regexp.MustCompile(`(?i)Firefox/|FxiOS/`), "Firefox"},
	{regexp.MustCompile(`(?i)Chrome/|CriOS/`), "Chrome"},
	{regexp.MustCompile(`(?i)Version/.*Safari/`), "Safari"},
}

type Store struct {
	DB     *sql.DB
	Secret []byte
	Now    func() time.Time
	Locate func(string) Location
}
type Location struct {
	Region *string
	Status string
	Raw    *string
	Error  *string
}

func NormalizeIP(value string) string {
	ip, err := netip.ParseAddr(value)
	if err != nil || ip.Zone() != "" {
		return ""
	}
	return ip.Unmap().String()
}
func ValidBrowserID(value string) bool { return browserID.MatchString(value) }
func (s Store) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}
func stamp(date time.Time) string { return date.UTC().Format("2006-01-02T15:04:05.000Z") }
func day(date time.Time) string   { return date.In(shanghai).Format("2006-01-02") }
func (s Store) hash(value string) string {
	mac := hmac.New(sha256.New, s.Secret)
	mac.Write([]byte(value))
	return hex.EncodeToString(mac.Sum(nil))
}
func (s Store) identity(ip, browser string) string {
	if browser != "" {
		return s.hash("browser:" + strings.ToLower(browser))
	}
	return s.hash("visitor:" + ip)
}
func (s Store) Identity(ip, browser string) string {
	ip = NormalizeIP(ip)
	if ip == "" || !ValidBrowserID(browser) {
		return ""
	}
	return s.identity(ip, browser)
}
func Browser(userAgent string) *string {
	for _, p := range browserPatterns {
		if p.pattern.MatchString(userAgent) {
			s := p.name
			return &s
		}
	}
	return nil
}
func (s Store) Record(ctx context.Context, ip, browser, userAgent string) (map[string]any, error) {
	ip = NormalizeIP(ip)
	if ip == "" || browser != "" && !ValidBrowserID(browser) || len(s.Secret) < 32 {
		return nil, errors.New("来访信息无效")
	}
	identity := s.identity(ip, browser)
	meteor := s.hash("meteor:" + identity)[:24]
	now := s.now()
	date := stamp(now)
	// Lookup before holding a database lock. The row is rechecked under the transaction.
	var knownRegion, knownIP *string
	err := s.DB.QueryRowContext(ctx, "SELECT region,ip FROM visitors WHERE identity=?", identity).Scan(&knownRegion, &knownIP)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	var location *Location
	if knownRegion == nil || knownIP == nil || *knownIP != ip {
		value := Location{Status: "database_unavailable"}
		if s.Locate != nil {
			value = s.Locate(ip)
		}
		location = &value
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var region, raw, geoError any
	region = knownRegion
	var status any
	if location != nil {
		region = location.Region
		raw = location.Raw
		geoError = location.Error
		status = location.Status
	}
	// A no-op duplicate UPDATE takes an exclusive record lock. INSERT IGNORE would
	// take shared duplicate-key locks and deadlock when concurrent visits upgrade them.
	result, err := tx.ExecContext(ctx, "INSERT INTO visitors(identity,meteor_id,first_seen,last_seen,region,ip,geo_status,geo_raw,geo_error,browser) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE identity=VALUES(identity)", identity, meteor, date, date, region, ip, status, raw, geoError, Browser(userAgent))
	if err != nil {
		return nil, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}
	if inserted == 0 {
		if err = tx.QueryRowContext(ctx, "SELECT region,ip FROM visitors WHERE identity=? FOR UPDATE", identity).Scan(&knownRegion, &knownIP); err != nil {
			return nil, err
		}
		if knownIP != nil && *knownIP == ip && knownRegion != nil {
			region = knownRegion
		}
		_, err = tx.ExecContext(ctx, "UPDATE visitors SET last_seen=GREATEST(last_seen,?),region=?,ip=?,geo_status=COALESCE(?,geo_status),geo_raw=CASE WHEN ? IS NULL THEN geo_raw ELSE ? END,geo_error=CASE WHEN ? IS NULL THEN geo_error ELSE ? END,browser=COALESCE(?,browser) WHERE identity=?", date, region, ip, status, status, raw, status, geoError, Browser(userAgent), identity)
		if err != nil {
			return nil, err
		}
	}
	if _, err = tx.ExecContext(ctx, "INSERT IGNORE INTO daily_visitors(day,identity) VALUES(?,?)", day(now), identity); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return map[string]any{"isNew": inserted == 1, "meteorId": meteor}, nil
}
func (s Store) Summary(ctx context.Context, days int, identity string) (map[string]any, error) {
	if days == 0 {
		days = 30
	} else if days < 0 {
		days = 1
	}
	if days > 365 {
		days = 365
	}
	now := s.now()
	local := now.In(shanghai)
	cutoff := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, shanghai).AddDate(0, 0, -days+1)
	var total, today int
	if err := s.DB.QueryRowContext(ctx, "SELECT count(*) FROM visitors").Scan(&total); err != nil {
		return nil, err
	}
	if err := s.DB.QueryRowContext(ctx, "SELECT count(*) FROM daily_visitors WHERE day=?", day(now)).Scan(&today); err != nil {
		return nil, err
	}
	rows, err := s.DB.QueryContext(ctx, "SELECT meteor_id,last_seen,region FROM visitors WHERE last_seen>=? ORDER BY last_seen DESC,meteor_id LIMIT 500", stamp(cutoff))
	if err != nil {
		return nil, err
	}
	meteors := []map[string]any{}
	for rows.Next() {
		var id, last string
		var region *string
		if err = rows.Scan(&id, &last, &region); err != nil {
			rows.Close()
			return nil, err
		}
		date, err := time.Parse(time.RFC3339Nano, last)
		if err != nil {
			rows.Close()
			return nil, err
		}
		meteors = append(meteors, map[string]any{"id": id, "arrivedOn": day(date), "region": region})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	result := map[string]any{"total": total, "today": today, "meteors": meteors}
	if identity != "" {
		var id, last string
		var region *string
		err = s.DB.QueryRowContext(ctx, "SELECT meteor_id,last_seen,region FROM visitors WHERE identity=?", identity).Scan(&id, &last, &region)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		if err == nil {
			result["meteorId"] = id
			exists := false
			for _, m := range meteors {
				if m["id"] == id {
					exists = true
				}
			}
			if !exists {
				date, err := time.Parse(time.RFC3339Nano, last)
				if err != nil {
					return nil, err
				}
				meteors = append([]map[string]any{{"id": id, "arrivedOn": day(date), "region": region}}, meteors...)
				result["meteors"] = meteors
			}
		}
	}
	return result, nil
}

// The current Shanghai calendar day plus the previous six days.
func recordWindow(now time.Time) (time.Time, time.Time) {
	local := now.In(shanghai)
	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, shanghai)
	return today.AddDate(0, 0, -6), today.AddDate(0, 0, 1)
}

func (s Store) Records(ctx context.Context, page int, region, selectedDay, identity string) (map[string]any, error) {
	if page < 1 {
		page = 1
	}
	if page > 100000 {
		page = 100000
	}
	region = stringClip(strings.TrimSpace(region), 60)
	where := " WHERE (?='' OR LOCATE(?,COALESCE(region,'未知区域'))>0)"
	args := []any{region, region}
	if parsed, err := time.ParseInLocation("2006-01-02", selectedDay, shanghai); err == nil {
		where += " AND first_seen>=? AND first_seen<?"
		args = append(args, stamp(parsed), stamp(parsed.AddDate(0, 0, 1)))
	}
	// Record browsing is limited to seven Shanghai calendar days. Keep chart
	// aggregation independent so historical statistics remain available.
	distributionWhere := where
	distributionArgs := append([]any{}, args...)
	from, until := recordWindow(s.now())
	where += " AND last_seen>=? AND last_seen<?"
	args = append(args, stamp(from), stamp(until))
	var total int
	if err := s.DB.QueryRowContext(ctx, "SELECT count(*) FROM visitors"+where, args...).Scan(&total); err != nil {
		return nil, err
	}
	pages := (total + 9) / 10
	if pages < 1 {
		pages = 1
	}
	if page > pages {
		page = pages
	}
	rows, err := s.DB.QueryContext(ctx, "SELECT meteor_id,first_seen,last_seen,region,geo_raw,browser FROM visitors"+where+" ORDER BY last_seen DESC,meteor_id LIMIT 10 OFFSET ?", append(append([]any{}, args...), (page-1)*10)...)
	if err != nil {
		return nil, err
	}
	records := []map[string]any{}
	for rows.Next() {
		var id, first, last string
		var region, raw, browser *string
		if err = rows.Scan(&id, &first, &last, &region, &raw, &browser); err != nil {
			rows.Close()
			return nil, err
		}
		f, err := time.Parse(time.RFC3339Nano, first)
		if err != nil {
			rows.Close()
			return nil, err
		}
		l, err := time.Parse(time.RFC3339Nano, last)
		if err != nil {
			rows.Close()
			return nil, err
		}
		city := (*string)(nil)
		if raw != nil {
			city = City(*raw)
		}
		records = append(records, map[string]any{"id": id, "region": region, "city": city, "browser": browser, "firstSeenAt": first, "lastSeenAt": last, "arrivedOn": day(f), "lastSeenOn": day(l)})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	rows, err = s.DB.QueryContext(ctx, "SELECT COALESCE(region,'未知区域') AS region,count(*) AS count FROM visitors"+distributionWhere+" GROUP BY COALESCE(region,'未知区域') ORDER BY count DESC,region", distributionArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	distribution := []map[string]any{}
	distributionTotal := 0
	for rows.Next() {
		var region string
		var count int
		if err = rows.Scan(&region, &count); err != nil {
			return nil, err
		}
		distribution = append(distribution, map[string]any{"region": region, "count": count})
		distributionTotal += count
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	result := map[string]any{"total": total, "page": page, "pages": pages, "distribution": distribution, "distributionTotal": distributionTotal, "records": records}
	if identity != "" {
		var id string
		err = s.DB.QueryRowContext(ctx, "SELECT meteor_id FROM visitors WHERE identity=?", identity).Scan(&id)
		if err == nil {
			result["meteorId"] = id
		} else if err != sql.ErrNoRows {
			return nil, err
		}
	}
	return result, nil
}
func stringClip(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}
func (s Store) Timeline(ctx context.Context) (map[string]any, error) {
	today := day(s.now())
	var first *string
	if err := s.DB.QueryRowContext(ctx, "SELECT min(day) FROM daily_visitors WHERE day<=?", today).Scan(&first); err != nil {
		return nil, err
	}
	if first == nil {
		return map[string]any{"dimension": "day", "points": []any{}, "total": 0}, nil
	}
	start, err := time.Parse("2006-01-02", *first)
	if err != nil {
		return nil, err
	}
	end, err := time.Parse("2006-01-02", today)
	if err != nil {
		return nil, err
	}
	monthly := end.Sub(start) >= 30*24*time.Hour
	expression := "day"
	dimension := "day"
	format := "2006-01-02"
	if monthly {
		expression = "SUBSTRING(day,1,7)"
		dimension = "month"
		format = "2006-01"
		start = time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC)
	}
	rows, err := s.DB.QueryContext(ctx, "SELECT "+expression+" AS period,count(DISTINCT identity) FROM daily_visitors WHERE day<=? GROUP BY "+expression+" ORDER BY period", today)
	if err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for rows.Next() {
		var period string
		var count int
		if err = rows.Scan(&period, &count); err != nil {
			rows.Close()
			return nil, err
		}
		counts[period] = count
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	points := []map[string]any{}
	for !start.After(end) {
		period := start.Format(format)
		points = append(points, map[string]any{"period": period, "count": counts[period]})
		if monthly {
			start = start.AddDate(0, 1, 0)
		} else {
			start = start.AddDate(0, 0, 1)
		}
	}
	var total int
	if err = s.DB.QueryRowContext(ctx, "SELECT count(DISTINCT identity) FROM daily_visitors WHERE day<=?", today).Scan(&total); err != nil {
		return nil, err
	}
	return map[string]any{"dimension": dimension, "points": points, "total": total}, nil
}
