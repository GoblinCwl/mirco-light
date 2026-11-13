# 微光集 · Quartz Server

Go 常驻业务后端。项目入口见 [部署目录 README](../README.md)，全局职责、配置、权限、部署、备份和故障处理统一维护在 [服务规则](../architecture/service-rules.md)。

## 代码入口

| 位置 | 职责 |
| --- | --- |
| `cmd/quartz-server`、`internal/application` | 生命周期、依赖装配、后台同步与优雅关闭 |
| `internal/httpapi/site.go` | 同源检查、管理员校验和站点接口分发 |
| `internal/httpapi/site_*.go` | 身份、配置、内容、数据管理、互动与监控接口 |
| `internal/httpapi/gateway.go` | 请求方法、大小、限流、超时和凭据隔离 |
| `internal/auth`、`settings`、`credentials` | TOTP、会话、配置及加密平台凭据 |
| `internal/content`、`journal` | 四源索引、标签、搜索、RSS、流新和运行纪事 |
| `internal/openlist`、`repo`、`video` | 文件分享、仓库和 Bilibili 适配与同步 |
| `internal/jellyfin` | 媒体授权、播放协商、字幕与受限资源代理 |
| `internal/visitors` | 访问记录、统计及 MySQL GeoIP 数据集 |
| `internal/adapters`、`monitoring`、`comments` | 首页聚合、星历、服务状态和 Artalk 适配 |
| `internal/cache` | [共享缓存实现及约定](../architecture/cache.md) |
| `database/init.sql` | 当前初始化 SQL，说明见 [库表设计](../architecture/database.md) |

## 更新与验证

```sh
go test -race ./...
go vet ./...
go build ./cmd/quartz-server ./cmd/quartz-admin ./cmd/quartz-observer
```

集成测试使用显式 `TEST_*` 环境变量和自动创建的隔离数据库，不能将清库逻辑指向生产库。验证结果不能替代浏览器体验检查。

部署、宿主观察器、管理员维护和 GeoIP 导入命令统一见 [服务规则](../architecture/service-rules.md)。服务启动不执行数据库结构检查或升级。

任务实例记录由 `internal/taskruns/` 维护；任务执行处使用上下文记录真实结果与最多十次历史，队列提供只读快照。新增结构先显式应用 `database/migrations/20261113_task_runs.sql`，然后部署服务及宿主观察器；服务启动只恢复执行状态，不执行 DDL。接口与保留规则见[服务规则](../architecture/service-rules.md)。
