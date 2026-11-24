package taskconfig

import (
	"fmt"
	"math/bits"
	"strconv"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
)

var Beijing = time.FixedZone("Asia/Shanghai", 8*60*60)
var parser = cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)

var periodic = map[string]bool{
	"index-share": true, "index-repo": true, "github-social": true, "bilibili-social": true,
	"activitywatch-summary": true, "video-sync": true, "friends-refresh": true,
	"service-journal": true, "build-journal": true, "auth-cleanup": true,
	"monitor-cleanup": true, "media-cleanup": true, "container-observer": true,
}

func IsPeriodic(name string) bool { return periodic[name] }
func CronKey(name string) string  { return "tasks." + name + "Cron" }

type Plan struct {
	Expression string
	Summary    string
	schedule   cron.Schedule
}

type interval struct {
	step   time.Duration
	anchor time.Time
}

func (s interval) Next(at time.Time) time.Time {
	elapsed := at.Sub(s.anchor)
	if elapsed < 0 {
		return s.anchor
	}
	return at.Add(s.step - elapsed%s.step)
}

func Parse(expression string) (Plan, error) {
	expression = strings.Join(strings.Fields(expression), " ")
	if expression == "" || strings.Contains(expression, "TZ=") {
		return Plan{}, fmt.Errorf("请输入 Cron 表达式，统一按北京时间执行")
	}
	fields := strings.Fields(expression)
	if fields[0] == "@every" {
		if len(fields) != 2 {
			return Plan{}, fmt.Errorf("固定间隔格式为 @every 30s")
		}
		d, err := time.ParseDuration(fields[1])
		if err != nil || d < time.Second || d%time.Second != 0 {
			return Plan{}, fmt.Errorf("固定间隔须为整秒，例如 @every 30s 或 @every 1h30m")
		}
		return Plan{expression, "每 " + fields[1] + " 执行一次，按固定时点对齐", interval{d, time.Unix(0, 0)}}, nil
	}
	s, err := parser.Parse(expression)
	if err != nil {
		return Plan{}, fmt.Errorf("Cron 格式无效，请填写 5 段或含秒的 6 段表达式：%w", err)
	}
	plan := Plan{expression, describe(fields), s}
	if plan.Next(time.Now()).IsZero() {
		return Plan{}, fmt.Errorf("此表达式在未来五年内没有匹配时点")
	}
	return plan, nil
}

func describe(fields []string) string {
	if len(fields) == 1 {
		return map[string]string{"@yearly": "每年 1 月 1 日 00:00", "@annually": "每年 1 月 1 日 00:00", "@monthly": "每月 1 日 00:00", "@weekly": "每周日 00:00", "@daily": "每天 00:00", "@midnight": "每天 00:00", "@hourly": "每小时整点"}[fields[0]]
	}
	if len(fields) == 5 {
		fields = append([]string{"0"}, fields...)
	}
	if fields[3] == "*" && fields[4] == "*" && fields[5] == "*" {
		if fields[0] == "*" && fields[1] == "*" && fields[2] == "*" {
			return "每秒执行"
		}
		if n, ok := strings.CutPrefix(fields[0], "*/"); ok && fields[1] == "*" && fields[2] == "*" {
			return "每分钟从第 0 秒起，每隔 " + n + " 秒"
		}
		if n, ok := strings.CutPrefix(fields[1], "*/"); ok && fields[0] == "0" && fields[2] == "*" {
			return "每小时从第 0 分钟起，每隔 " + n + " 分钟"
		}
		if n, ok := strings.CutPrefix(fields[2], "*/"); ok && fields[0] == "0" && fields[1] == "0" {
			return "每天从 00:00 起，每隔 " + n + " 小时"
		}
		if second, e := strconv.Atoi(fields[0]); e == nil {
			if minute, e := strconv.Atoi(fields[1]); e == nil {
				if hour, e := strconv.Atoi(fields[2]); e == nil {
					return fmt.Sprintf("每天 %02d:%02d:%02d", hour, minute, second)
				}
				if fields[2] == "*" {
					return fmt.Sprintf("每小时第 %02d 分 %02d 秒", minute, second)
				}
			}
		}
	}
	labels := []string{"秒", "分钟", "小时", "每月日期", "月份", "星期"}
	out := make([]string, len(fields))
	for i, field := range fields {
		if field == "*" || field == "?" {
			field = "任意"
		}
		out[i] = labels[i] + " " + field
	}
	description := strings.Join(out, " · ")
	if fields[3] != "*" && fields[3] != "?" && fields[5] != "*" && fields[5] != "?" {
		description += "（日期或星期任一匹配）"
	}
	return description
}

func (p Plan) Next(at time.Time) time.Time {
	if p.schedule == nil {
		return time.Time{}
	}
	return p.schedule.Next(at.In(Beijing)).In(Beijing)
}

func (p Plan) HourCount(start time.Time) int {
	next := p.Next(start.Add(-time.Second))
	end := start.Add(time.Hour)
	if next.IsZero() || !next.Before(end) {
		return 0
	}
	switch s := p.schedule.(type) {
	case interval:
		return int(end.Add(-time.Nanosecond).Sub(next)/s.step) + 1
	case *cron.SpecSchedule:
		const clockMask = (uint64(1) << 60) - 1
		return bits.OnesCount64(s.Minute&clockMask) * bits.OnesCount64(s.Second&clockMask)
	default:
		return 0
	}
}

func IntervalExpression(seconds int) string {
	switch {
	case seconds == 1:
		return "* * * * * *"
	case seconds < 60 && 60%seconds == 0:
		return fmt.Sprintf("*/%d * * * * *", seconds)
	case seconds == 60:
		return "* * * * *"
	case seconds < 3600 && seconds%60 == 0 && 3600%seconds == 0:
		return fmt.Sprintf("*/%d * * * *", seconds/60)
	case seconds == 3600:
		return "0 * * * *"
	case seconds < 86400 && seconds%3600 == 0 && 86400%seconds == 0:
		return fmt.Sprintf("0 */%d * * *", seconds/3600)
	case seconds == 86400:
		return "0 0 * * *"
	default:
		return "@every " + (time.Duration(seconds) * time.Second).String()
	}
}

func effectivePlan(values map[string]any, name string) Plan {
	if raw, ok := values[CronKey(name)].(string); ok {
		if plan, err := Parse(raw); err == nil {
			return anchorLegacyFriends(plan, values, name)
		}
	}
	var expression string
	if name == "friends-refresh" {
		clock, _ := values["tasks.friendsTime"].(string)
		parsed, err := time.Parse("15:04", clock)
		if err != nil {
			parsed = time.Date(0, 1, 1, 6, 0, 0, 0, time.UTC)
		}
		expression = fmt.Sprintf("%d %d * * *", parsed.Minute(), parsed.Hour())
		if days, ok := values["tasks.friendsEveryDays"].(float64); ok && days >= 2 && days <= 30 && days == float64(int(days)) {
			expression = IntervalExpression(int(days) * 86400)
		}
	} else {
		for _, d := range Definitions {
			if d.Key != name {
				continue
			}
			seconds := d.Default
			if legacy, ok := values[Key(name)].(float64); ok && legacy >= float64(d.Min) && legacy <= float64(d.Max) && legacy == float64(int(legacy)) {
				seconds = int(legacy)
			}
			expression = IntervalExpression(seconds)
			break
		}
	}
	plan, _ := Parse(expression)
	return anchorLegacyFriends(plan, values, name)
}

func anchorLegacyFriends(plan Plan, values map[string]any, name string) Plan {
	if name != "friends-refresh" {
		return plan
	}
	days, _ := values["tasks.friendsEveryDays"].(float64)
	if days < 2 || days > 30 || days != float64(int(days)) || plan.Expression != IntervalExpression(int(days)*86400) {
		return plan
	}
	if old, ok := plan.schedule.(interval); ok {
		clock, _ := values["tasks.friendsTime"].(string)
		t, err := time.Parse("15:04", clock)
		if err != nil {
			t = time.Date(0, 1, 1, 6, 0, 0, 0, time.UTC)
		}
		old.anchor = time.Date(1970, 1, 1, t.Hour(), t.Minute(), 0, 0, Beijing)
		plan.schedule = old
		plan.Summary = fmt.Sprintf("每 %d 天 %02d:%02d 执行", int(days), t.Hour(), t.Minute())
	}
	return plan
}

func FillCron(values map[string]any) {
	for name := range periodic {
		values[CronKey(name)] = effectivePlan(values, name).Expression
	}
}

func (c *Config) Plan(name string) Plan {
	if c != nil {
		c.mu.Lock()
		plan, ok := c.plans[name]
		c.mu.Unlock()
		if ok {
			return plan
		}
	}
	return effectivePlan(nil, name)
}
