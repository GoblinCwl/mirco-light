# 微光集 · Quartz

本工程负责页面、浏览器组件、静态构建、文件监听与热重载。完整项目入口见 [部署目录 README](../README.md)，全局规范见 [整体架构](../README.md#整体架构)。

## 代码入口

| 位置 | 职责 |
| --- | --- |
| `quartz.config.ts`、`quartz.layout.ts` | 构建插件与页面布局 |
| `quartz/components/` | 页面组件、浏览器交互与样式 |
| `quartz/plugins/emitters/` | 文章、目录、Share、Repo、Video 等页面产物 |
| `quartz/util/contentSnapshot.ts` | 成功文章构建快照，交给 Go 更新索引 |
| `quartz/cli/buildControl.mjs` | Go 发起重载请求时的 Unix socket 接口 |
| `quartz/cli/buildProcess*.mjs` | 可释放的构建子进程、发布锁 IPC 与重载生命周期 |
| `quartz/cli/watchPolicy.mjs` | 源码与文章的监听范围、排除目录及文件规则 |
| `quartz/home/` | [首页配置与模块说明](quartz/home/README.md) |
| `quartz/components/scripts/preview/` | [普通文件预览与视频渲染](quartz/components/scripts/preview/README.md) |
| `docs/media-player/` | [Jellyfin 播放器职责与调用链](docs/media-player/README.md) |
| `tools/` | Excalidraw、Matroska 等浏览器资源构建工具 |

正常目录、标签、搜索、星轨和首页发现使用 Go 提供的统一索引；Share 文件目录按需读取 OpenList。详细缓存规则只在 [缓存约定](../architecture/cache.md) 维护。

## 开发验证

```sh
npx tsc --noEmit
npm test
node quartz/bootstrap-cli.mjs build
```

实际部署使用父目录 Compose，配置、数据库、权限、备份和服务重启规则统一见 [服务规则](../architecture/service-rules.md)。不在本工程启动第二套业务后端。

`docs/` 中的框架参考资料与本站维护规范分开，阅读入口见 [文档分类](docs/README.md)。
