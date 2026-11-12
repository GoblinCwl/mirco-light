// Package taskconfig owns persisted task periods and live scheduler updates.
package taskconfig

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Definition struct {
	Key, Label, Category, Help string
	Default, Min, Max          int
}

var Definitions = []Definition{
	{"index-share", "网盘索引刷新", "数据同步", "同步 OpenList 文件索引。", 60, 5, 86400},
	{"index-repo", "仓库索引刷新", "数据同步", "同步仓库索引及镜像动态。", 300, 10, 86400},
	{"github-social", "GitHub 动态刷新", "数据同步", "更新 GitHub 动态。", 1800, 60, 604800},
	{"bilibili-social", "Bilibili 动态刷新", "数据同步", "更新 Bilibili 动态。", 1800, 60, 604800},
	{"activitywatch-summary", "ActivityWatch 汇总刷新", "数据同步", "更新活动统计。", 600, 30, 86400},
	{"video-sync", "视频同步", "数据同步", "完整同步视频列表与详情；启动时仍会执行一次。", 21600, 1800, 604800},
	{"video-retry", "视频同步失败重试", "失败重试", "同步失败或未完成时的等待时间。", 900, 60, 86400},
	{"service-journal", "服务日志采集", "日志与清理", "采集服务状态日志。", 1, 1, 3600},
	{"build-journal", "构建日志采集", "日志与清理", "采集构建状态日志。", 1, 1, 3600},
	{"auth-cleanup", "登录会话清理", "日志与清理", "清理过期登录会话与认证记录。", 3600, 60, 86400},
	{"monitor-cleanup", "监控连接清理", "日志与清理", "检查并关闭闲置监控连接。", 10, 1, 3600},
	{"media-cleanup", "媒体会话清理", "日志与清理", "清理过期播放会话与资源。", 60, 5, 3600},
	{"attendance-quiet", "日历变更合并等待", "事件任务", "目录变更后等待此时间再刷新日历。", 60, 1, 3600},
	{"attendance-retry", "日历监听恢复重试", "失败重试", "目录监听异常后的恢复等待时间。", 10, 1, 3600},
	{"event-retry", "文章、权限及凭据事件重试", "失败重试", "事件处理失败后的等待时间；新事件仍会立即唤醒。", 15, 1, 3600},
	{"video-index-retry", "视频索引失败重试", "失败重试", "视频索引处理失败后的等待时间。", 15, 1, 3600},
	{"friend-recovery", "友链队列数据库重试", "失败重试", "队列恢复、领取或完成记录写入失败后的等待时间。", 5, 1, 3600},
	{"friend-retry", "友链队列首次重试", "失败重试", "头像、RSS 或审核失败后的首次等待时间，后续指数退避并受最长等待限制。已排队任务沿用已记录的重试时间。", 60, 1, 3600},
	{"friend-retry-max", "友链队列最长重试等待", "失败重试", "限制友链处理失败后的退避等待时间；低于首次等待时优先使用本上限。", 3600, 1, 86400},
	{"container-observer", "容器状态观察", "日志与清理", "宿主观察器检查容器状态的周期。", 10, 1, 3600},
}

func Key(name string) string { return "tasks." + name + "Seconds" }
func Schema() []map[string]any {
	out := []map[string]any{}
	for _, d := range Definitions {
		out = append(out, map[string]any{"key": Key(d.Key), "group": "任务管理", "category": d.Category, "label": d.Label, "help": d.Help, "type": "number", "default": d.Default, "min": d.Min, "max": d.Max, "step": 1, "public": false})
	}
	out = append(out, map[string]any{"key": "tasks.friendsEveryDays", "group": "任务管理", "category": "友链巡检", "label": "巡检间隔", "help": "默认每天一次；调整间隔后，首页失败的七次重试也按新巡检间隔执行。日期按固定日历周期安排，重启不会推迟日程。", "type": "number", "default": 1, "min": 1, "max": 30, "step": 1, "public": false})
	return append(out, map[string]any{"key": "tasks.friendsTime", "group": "任务管理", "category": "友链巡检", "label": "执行时间", "help": "北京时间；检查首页可用性、头像和 RSS，并补入待审核队列。同日最多重试一次，连续失败七次停用。", "type": "time", "default": "06:00", "public": false})
}

type Config struct {
	mu       sync.Mutex
	values   map[string]any
	watchers map[chan struct{}]map[string]bool
}
type contextKey struct{}

func With(ctx context.Context, c *Config) context.Context {
	return context.WithValue(ctx, contextKey{}, c)
}
func From(ctx context.Context) *Config { c, _ := ctx.Value(contextKey{}).(*Config); return c }
func New(values map[string]any) *Config {
	c := &Config{watchers: map[chan struct{}]map[string]bool{}}
	c.Reload(values)
	return c
}
func (c *Config) Reload(values map[string]any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	next := map[string]any{}
	for _, d := range Definitions {
		v := float64(d.Default)
		if x, ok := values[Key(d.Key)].(float64); ok && x >= float64(d.Min) && x <= float64(d.Max) && x == float64(int(x)) {
			v = x
		}
		next[Key(d.Key)] = v
	}
	clock := "06:00"
	if x, ok := values["tasks.friendsTime"].(string); ok {
		if _, err := time.Parse("15:04", x); err == nil && len(x) == 5 {
			clock = x
		}
	}
	next["tasks.friendsTime"] = clock
	days := float64(1)
	if x, ok := values["tasks.friendsEveryDays"].(float64); ok && x >= 1 && x <= 30 && x == float64(int(x)) {
		days = x
	}
	next["tasks.friendsEveryDays"] = days
	for ch, keys := range c.watchers {
		for k := range keys {
			if next[k] != c.values[k] {
				select {
				case ch <- struct{}{}:
				default:
				}
				break
			}
		}
	}
	c.values = next
}
func (c *Config) Clock() string {
	if c == nil {
		return "06:00"
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.values["tasks.friendsTime"].(string)
}
func (c *Config) FriendDays() int {
	if c == nil {
		return 1
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return int(c.values["tasks.friendsEveryDays"].(float64))
}
func Duration(ctx context.Context, name string) time.Duration {
	c := From(ctx)
	if c != nil {
		c.mu.Lock()
		v, ok := c.values[Key(name)].(float64)
		c.mu.Unlock()
		if ok {
			return time.Duration(v) * time.Second
		}
	}
	for _, d := range Definitions {
		if d.Key == name {
			return time.Duration(d.Default) * time.Second
		}
	}
	panic(fmt.Sprintf("unknown task %s", name))
}
func Watch(ctx context.Context, keys ...string) (<-chan struct{}, func()) {
	c := From(ctx)
	ch := make(chan struct{}, 1)
	if c == nil {
		return ch, func() {}
	}
	wanted := map[string]bool{}
	for _, k := range keys {
		wanted[k] = true
	}
	c.mu.Lock()
	c.watchers[ch] = wanted
	c.mu.Unlock()
	return ch, func() { c.mu.Lock(); delete(c.watchers, ch); c.mu.Unlock() }
}

// Ticker rearms an idle schedule on configuration changes without triggering work.
type Ticker struct {
	C      <-chan time.Time
	cancel context.CancelFunc
	done   chan struct{}
}

func NewTicker(ctx context.Context, name string) *Ticker {
	root, cancel := context.WithCancel(ctx)
	out := make(chan time.Time)
	t := &Ticker{C: out, cancel: cancel, done: make(chan struct{})}
	changed, stop := Watch(root, Key(name))
	go func() {
		defer close(t.done)
		defer stop()
		tick := time.NewTicker(Duration(root, name))
		defer tick.Stop()
		for {
			select {
			case <-root.Done():
				return
			case <-changed:
				tick.Reset(Duration(root, name))
			case now := <-tick.C:
				select {
				case out <- now:
				case <-root.Done():
					return
				case <-changed:
					tick.Reset(Duration(root, name))
				}
			}
		}
	}()
	return t
}
func (t *Ticker) Stop() { t.cancel(); <-t.done }

// Wait is a cancellable, configurable failure/debounce delay.
func Wait(ctx context.Context, name string, wake <-chan struct{}) bool {
	changed, stop := Watch(ctx, Key(name))
	defer stop()
	timer := time.NewTimer(Duration(ctx, name))
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return false
		case <-wake:
			return true
		case <-changed:
			timer.Reset(Duration(ctx, name))
		case <-timer.C:
			return true
		}
	}
}
