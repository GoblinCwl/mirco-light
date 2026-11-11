# 请求缓存与生命周期

缓存是共享基础模块，不是界面组件。模块声明键、有效期、容量和失效事件，不各自实现 Promise 合并、取消或淘汰。前端与 Go 分别使用各自运行环境的共享实现。

## 前端

唯一实现：[sharedRequest.ts](../quartz/quartz/components/scripts/sharedRequest.ts)。独立 inline bundle 通过 `sharedState()` 共享缓存实例，避免各份模块重复请求。

- `read(key, load, {signal, refresh})`：合并同键并发读取，限定容量与有效期。
- 调用者退出只取消自己的订阅；全部调用者离开才中断底层请求。
- 失败结果不缓存，后续读取允许重试。
- `clear()`：主动失效，取消旧请求，防止旧响应重新进入缓存。
- `peek(key, true)`：只供已有界面在刷新期间保留上次成功数据；真正读取仍检查有效期。
- 写入接口成功后触发对应失效事件，不缓存写入结果。

| 数据 | 策略所属模块 |
| --- | --- |
| 全站索引 | [contentCatalog.ts](../quartz/quartz/components/scripts/contentCatalog.ts) |
| 仓库目录及分支读取 | [repoClient.ts](../quartz/quartz/components/scripts/repoClient.ts) |
| 视频库 | [videoLibrary.ts](../quartz/quartz/components/scripts/videoLibrary.ts) |
| 本站及 Share 身份 | [siteSession.ts](../quartz/quartz/components/scripts/siteSession.ts) |
| 星历月份 | [attendanceClient.ts](../quartz/quartz/components/scripts/attendanceClient.ts) |
| 分享入口 | [driveEntries.ts](../quartz/quartz/components/scripts/driveEntries.ts) |

新增普通 JSON 读取时，按下面方式接入；在 load 内先验证响应，再交给缓存保存：

```ts
const state = sharedState('module-name:v1', () => new RequestCache<Result>(ttl, capacity))
return state.read(key, async signal => {
  const result = await loadAndValidate(signal)
  return result
}, { signal: pageSignal })
```

具体时长和容量以各模块实例参数为准。私有数据的键必须包含相关账号、路径或权限范围；登出及权限变化要失效。身份缓存仅服务界面，写操作仍由后端校验。

页面作用域的事件、计时器、播放器与请求使用 AbortController 或已有 dispose 接口释放，通过 `window.addCleanup()` 接入 SPA 离页清理。后台订阅可以共用缓存，页面销毁不能误取消其他读者。

## Go

唯一通用实现：[internal/cache](../quartz-server/internal/cache/cache.go)。提供并发合并、容量及字节限制、来源故障时可选的旧数据复用。启用旧数据回退的模块必须明确标记状态，不把失败伪装为最新数据。

MySQL 持久化快照负责跨重启保留数据；进程缓存负责合并请求、限制上游压力，两者职责不同。认证会话、播放会话和操作状态保留各自生命周期，不当作普通公开结果缓存。

## 不进入通用缓存的内容

文件下载和媒体流、一次性写操作、表单提交、逐次权限校验。它们由各自业务管理取消、有效期和授权；不能简单套用公开查询的缓存键。

浏览器 HTTP / CacheStorage 中的版本化静态资源缓存属于持久资产存储，保留自身来源、容量与清理规则；不把大型播放器资源复制进普通 API 的内存结果缓存。

## 寻径骨架占位

浏览器只缓存寻径与备案的公开名称、排序后的条目数量和是否含图标（`quartz-navigation-layout:v1`），供下次首页解析时生成同尺寸占位。配置接口仍为唯一数据来源；每次有效配置读取或保存后更新占位缓存，不保存链接目标、SVG 或凭据，也不增加请求或周期任务。首次访问、禁用存储或缓存无效时使用静态默认骨架；SPA 导航复用同一恢复函数，已加载内容不被占位覆盖。
