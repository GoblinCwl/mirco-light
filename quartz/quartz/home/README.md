# 首页维护

首页由 HomePage emitter 生成 `/index.html`，不读取资料库中的首页 Markdown。当前系统职责以根 README 为准。

- `config.ts`、`template.ts`、`icons.ts`：首页配置、布局和图标。
- `../components/styles/homeDashboard.scss`：布局、响应式和骨架。
- `../components/scripts/homeDashboard.inline.ts`：首页状态与聚合数据。
- `../components/scripts/attendance.ts`：星历及详情。
- `../components/scripts/encounter.inline.ts`：文章、分享、仓库、视频的拾遗，读取服务器统一索引；悬停才预览视频。
- `../components/scripts/videoPreview.ts`：视频预览浮层。

同级 `quartz-server` 聚合日历、QQ、活动、访客与索引；本站缓存使用 MySQL。日记只读取公开统计需要的标记字段，监听变化后延迟聚合，不公开正文。

首页下统计入口为篇章（文章、仓库、分享、视频总数，跳转视界）、标签（流光）、光阴（星碑）。光阴由站点配置 `site.foundedDate` 按北京时间计算，上线当天记为第 1 天，未配置时显示 —。页面加载与接口状态独立，骨架尺寸需要与最终响应式布局一致。

修改配置、模板或文章会触发 Quartz 构建；动态数据经同源 Nginx 接口访问 Go 服务。点击 QQ 图标打开二维码弹框；二维码资源路径通过 `profile.qqQrCode` 配置。
