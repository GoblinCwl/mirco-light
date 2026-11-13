package taskruns

type Definition struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	Kind   string `json:"kind"`
	Period string `json:"periodKey,omitempty"`
	Queue  bool   `json:"hasQueue"`
}

var Definitions = []Definition{
	{"index-share", "网盘索引刷新", "periodic", "index-share", false},
	{"index-repo", "仓库索引刷新", "periodic", "index-repo", false},
	{"github-social", "GitHub 动态刷新", "periodic", "github-social", false},
	{"bilibili-social", "Bilibili 动态刷新", "periodic", "bilibili-social", false},
	{"activitywatch-summary", "ActivityWatch 汇总刷新", "periodic", "activitywatch-summary", false},
	{"video-sync", "视频同步", "periodic", "video-sync", true},
	{"friends-refresh", "友链巡检", "periodic", "", false},
	{"service-journal", "服务日志采集", "periodic", "service-journal", false},
	{"build-journal", "构建日志采集", "periodic", "build-journal", false},
	{"auth-cleanup", "登录会话清理", "periodic", "auth-cleanup", false},
	{"monitor-cleanup", "监控连接清理", "periodic", "monitor-cleanup", false},
	{"media-cleanup", "媒体会话清理", "periodic", "media-cleanup", false},
	{"container-observer", "容器状态观察", "periodic", "container-observer", false},
	{"friend-jobs", "友链处理队列", "queue", "", true},
	{"article-index", "文章索引队列", "queue", "", true},
	{"comment-permissions", "评论权限队列", "queue", "", true},
	{"gitea-mirror-credential", "镜像凭据队列", "queue", "", true},
	{"video-index", "视频索引队列", "queue", "", true},
	{"attendance-refresh", "日历刷新队列", "queue", "", true},
	{"attendance-watch", "日历监听恢复", "event", "attendance-retry", false},
	{"friend-recovery", "友链队列恢复", "event", "friend-recovery", false},
}

func Lookup(key string) (Definition, bool) {
	for _, d := range Definitions {
		if d.Key == key {
			return d, true
		}
	}
	return Definition{}, false
}
