package video

import (
	"context"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Controller struct {
	Store     Store
	Client    *Client
	AfterSync func(context.Context) error
	Social    func(context.Context, bool) error
	mu        sync.Mutex
	wg        sync.WaitGroup
	queue     []taskruns.QueueItem
	retrying  bool
	running   bool
	closed    bool
	interval  time.Duration
	timer     *time.Timer
	ctx       context.Context
	cancel    context.CancelFunc
}

func NewController(ctx context.Context, store Store, client *Client) (*Controller, error) {
	meta, err := store.Meta(ctx)
	if err != nil {
		return nil, err
	}
	interval := 6 * time.Hour
	if milliseconds, err := strconv.ParseInt(meta["sync_interval_ms"], 10, 64); err == nil && milliseconds >= 30*60000 && milliseconds <= 10080*60000 {
		interval = time.Duration(milliseconds) * time.Millisecond
	}
	ctx, cancel := context.WithCancel(ctx)
	c := &Controller{Store: store, Client: client, interval: interval, ctx: ctx, cancel: cancel}
	if tracker := taskruns.From(ctx); tracker != nil {
		tracker.RegisterQueue("video-sync", func() []taskruns.QueueItem {
			c.mu.Lock()
			defer c.mu.Unlock()
			return append([]taskruns.QueueItem{}, c.queue...)
		})
	}
	if taskconfig.From(ctx) != nil {
		c.interval = taskconfig.Duration(ctx, "video-sync")
		changed, stop := taskconfig.Watch(ctx, taskconfig.Key("video-sync"), taskconfig.Key("video-retry"))
		c.wg.Add(1)
		go func() {
			defer c.wg.Done()
			defer stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-changed:
					c.mu.Lock()
					c.interval = taskconfig.Duration(ctx, "video-sync")
					if !c.running {
						delay := c.interval
						if c.retrying {
							delay = taskconfig.Duration(ctx, "video-retry")
						}
						c.schedule(delay)
					}
					c.mu.Unlock()
				}
			}
		}()
	}
	return c, nil
}
func (c *Controller) schedule(delay time.Duration) {
	if c.timer != nil {
		c.timer.Stop()
	}
	if c.ctx.Err() != nil || c.closed {
		return
	}
	c.timer = time.AfterFunc(delay, func() { c.Start() })
}
func (c *Controller) Start() {
	c.mu.Lock()
	if c.running || c.closed || c.ctx.Err() != nil {
		c.mu.Unlock()
		return
	}
	if c.timer != nil {
		c.timer.Stop()
	}
	c.running = true
	if len(c.queue) == 0 {
		c.queue = []taskruns.QueueItem{{ID: "catalog", Label: "获取视频列表和合集", State: "running"}}
	}
	c.wg.Add(1)
	c.mu.Unlock()
	go func() {
		defer c.wg.Done()
		runContext, cancel := context.WithTimeout(c.ctx, 20*time.Minute)
		defer cancel()
		complete := false
		err := taskruns.Run(runContext, "video-sync", func(ctx context.Context) error {
			var err error
			complete, err = c.safeRun(ctx)
			if err == nil && !complete {
				err = errors.New("视频列表、合集或详情尚未全部同步完成")
			}
			return err
		})
		if err != nil {
			c.Store.PutText(c.ctx, "last_attempt", stamp())
			c.Store.PutText(c.ctx, "last_error", "视频同步失败，保留已有数据")
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		c.running = false
		c.retrying = err != nil || !complete
		delay := c.interval
		if err != nil || !complete {
			alerts.Emit(alerts.Event{Kind: "task", Level: "warning", Source: "视频同步", Title: "Bilibili 视频同步未完成", Message: "保留已有数据，将按原有机制重试"})
			delay = taskconfig.Duration(c.ctx, "video-retry")
		}
		if err != nil || !complete {
			if len(c.queue) == 0 {
				c.queue = []taskruns.QueueItem{{ID: "catalog", Label: "视频列表 / 合集信息"}}
			}
			for i := range c.queue {
				c.queue[i].State = "retry"
				c.queue[i].AvailableAt = time.Now().Add(delay).UTC().Format(time.RFC3339)
				if c.queue[i].Error == "" && err != nil {
					c.queue[i].Error = taskruns.Clean(err.Error(), 1000)
				}
			}
		} else {
			c.queue = nil
		}
		c.schedule(delay)
	}()
}
func (c *Controller) Close() {
	c.mu.Lock()
	c.closed = true
	if c.cancel != nil {
		c.cancel()
	}
	if c.timer != nil {
		c.timer.Stop()
	}
	c.mu.Unlock()
	c.wg.Wait()
}
func (c *Controller) run(ctx context.Context) (bool, error) {
	cookie := ""
	var err error
	if c.Client.Cookie != nil {
		cookie, err = c.Client.Cookie(ctx)
		if err != nil {
			return false, err
		}
	}
	if c.Social != nil {
		_ = c.Social(ctx, true)
	}
	complete, err := c.syncList(ctx, cookie)
	if err != nil {
		return false, err
	}
	failures := 0
	if library, err := c.Client.Collections(ctx, cookie); err == nil {
		if err = c.Store.Put(ctx, "library", library); err != nil {
			return false, err
		}
	} else {
		failures++
	}
	videos, err := c.Store.All(ctx)
	if err != nil {
		return false, err
	}
	meta, err := c.Store.Meta(ctx)
	if err != nil {
		return false, err
	}
	targets := []map[string]any{}
	for _, v := range videos {
		targets = append(targets, map[string]any{"bvid": v.BVID, "title": v.Title, "ownerMid": c.Client.MID})
	}
	for _, test := range list(parse(meta["test_videos"], []any{})) {
		targets = append(targets, object(test))
	}
	c.mu.Lock()
	c.queue = nil
	for _, target := range targets {
		if target["availability"] != "unavailable" {
			label := text(target["title"])
			if label == "" {
				label = text(target["bvid"])
			}
			c.queue = append(c.queue, taskruns.QueueItem{ID: text(target["bvid"]), Label: label, State: "pending"})
		}
	}
	c.mu.Unlock()
	taskruns.Note(ctx, fmt.Sprintf("待同步视频详情 %d 个", len(targets)))
	for _, v := range targets {
		if v["availability"] == "unavailable" {
			continue
		}
		owner := text(v["ownerMid"])
		if owner == "" {
			owner = c.Client.MID
		}
		c.updateQueueItem(text(v["bvid"]), "running", nil)
		detail, err := c.Client.Detail(ctx, text(v["bvid"]), owner, cookie)
		if err != nil {
			failures++
			c.updateQueueItem(text(v["bvid"]), "retry", err)
			taskruns.Note(ctx, "视频 "+text(v["bvid"])+"："+err.Error())
		} else if err = c.Store.Put(ctx, "detail:"+text(v["bvid"]), detail); err != nil {
			return false, err
		}
		if err == nil {
			c.updateQueueItem(text(v["bvid"]), "done", nil)
		}
		if err = wait(ctx, 400*time.Millisecond); err != nil {
			return false, err
		}
	}
	if complete && c.AfterSync != nil {
		if err = c.AfterSync(ctx); err != nil {
			return false, err
		}
	}
	return complete && failures == 0, nil
}
func limited(err error) bool {
	var e *APIError
	if !errors.As(err, &e) {
		return false
	}
	return e.HTTP == 412 || e.HTTP == 429 || e.Code == -352 || e.Code == -412 || e.Code == -799
}
func (c *Controller) anonymousCookies(ctx context.Context) string {
	client := c.Client.HTTP
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, "GET", "https://www.bilibili.com/", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", userAgent)
	response, err := alerts.Do(client, "Bilibili", req)
	if err != nil {
		return ""
	}
	response.Body.Close()
	values := []string{}
	for _, cookie := range response.Cookies() {
		values = append(values, cookie.Name+"="+cookie.Value)
	}
	return strings.Join(values, "; ")
}
func (c *Controller) syncList(ctx context.Context, cookie string) (bool, error) {
	if cookie == "" {
		cookie = c.anonymousCookies(ctx)
	}
	mode := "series"
	img, sub := "", ""
	videos := []Video{}
	seen := map[string]bool{}
	total := 0
	complete := false
	for page := 1; page <= 25; page++ {
		var rows []Video
		var err error
		for attempt := 0; attempt < 3; attempt++ {
			var payload map[string]any
			for {
				var endpoint string
				switch mode {
				case "series":
					endpoint = "https://api.bilibili.com/x/series/recArchivesByKeywords?mid=" + encode(c.Client.MID) + "&keywords=&order=pubdate&pn=" + strconv.Itoa(page) + "&ps=20"
				case "legacy":
					endpoint = "https://api.bilibili.com/x/space/arc/search?mid=" + encode(c.Client.MID) + "&ps=20&pn=" + strconv.Itoa(page) + "&order=pubdate&platform=web&web_location=1550101"
				default:
					if img == "" {
						img, sub, err = c.Client.keys(ctx)
						if err != nil {
							break
						}
					}
					var query string
					query, err = SignWBI(map[string]string{"mid": c.Client.MID, "ps": "20", "pn": strconv.Itoa(page), "order": "pubdate", "platform": "web", "web_location": "1550101"}, img, sub, time.Now().Unix())
					if err != nil {
						break
					}
					endpoint = "https://api.bilibili.com/x/space/wbi/arc/search?" + query
				}
				payload, err = c.Client.request(ctx, endpoint, cookie, "https://space.bilibili.com/"+c.Client.MID+"/video")
				if err == nil {
					rows, total, err = parsePage(payload)
				}
				if err == nil || limited(err) || mode == "wbi" {
					break
				}
				if mode == "series" {
					mode = "legacy"
				} else {
					mode = "wbi"
				}
			}
			if err == nil {
				break
			}
			if attempt < 2 {
				if waitErr := wait(ctx, time.Duration(attempt+1)*8*time.Second); waitErr != nil {
					return false, waitErr
				}
			}
		}
		if err != nil {
			if len(videos) > 0 {
				_, mergeErr := c.Store.Merge(ctx, videos, stamp(), false)
				return false, mergeErr
			}
			return false, err
		}
		for _, v := range rows {
			if !seen[v.BVID] {
				seen[v.BVID] = true
				videos = append(videos, v)
			}
		}
		if len(rows) == 0 || len(videos) >= total {
			complete = true
			break
		}
		if err = wait(ctx, 3500*time.Millisecond); err != nil {
			return false, err
		}
	}
	if len(videos) == 0 && total > 0 {
		return false, fmt.Errorf("Bilibili returned an empty list")
	}
	if len(videos) < total {
		complete = false
	}
	at := stamp()
	for i := range videos {
		videos[i].FetchedAt = at
	}
	_, err := c.Store.Merge(ctx, videos, at, complete)
	return complete, err
}

func (c *Controller) safeRun(ctx context.Context) (complete bool, err error) {
	defer func() {
		if recover() != nil {
			complete = false
			err = errors.New("视频同步异常，保留缓存")
		}
	}()
	return c.run(ctx)
}

func (c *Controller) updateQueueItem(id, state string, workErr error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := range c.queue {
		if c.queue[i].ID != id {
			continue
		}
		if state == "done" {
			c.queue = append(c.queue[:i], c.queue[i+1:]...)
		} else {
			c.queue[i].State = state
			if workErr != nil {
				c.queue[i].Attempts++
				c.queue[i].Error = taskruns.Clean(workErr.Error(), 1000)
			}
		}
		return
	}
}
