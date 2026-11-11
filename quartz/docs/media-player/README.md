# Jellyfin 播放器重做

保留本站播放器外观、分享权限、媒体信息、选集与弹幕。Jellyfin 播放控制与普通文件预览分离；不再在一个预览函数中同时维护两套播放、换源和字幕状态。

## 调用链与职责

1. 页面：确认 OpenList 分享权限、匹配 Jellyfin 媒体，读取本站播放偏好。
2. 页面桥接：提交浏览器能力、画质、音轨、字幕选择；只在新流可播放后释放旧会话。
3. Jellyfin：决定直接播放、转封装或转码；Fontinass 处理 ASS 字体。
4. 独立播放器控制器：一个加载/换源流程、一条媒体时间轴、一组明确状态。续播和切换都复用这个流程。
5. 字幕模块：VTT/ASS/PGS 及烧录切换；不决定视频就绪。加载、错误和取消与视频状态分开。
6. 弹幕模块：匹配/离线/手动选择；不参与视频就绪或播放开关。
7. 界面模块：沿用现有样式和操作，将用户操作交给控制器。

### 文件入口

| 文件 | 唯一职责 |
| --- | --- |
| `drivePreview.ts` | 页面权限与偏好、浏览器能力、请求播放票据、提交/回滚会话 |
| `quartz-server/internal/jellyfin/` | Go 授权、媒体匹配、PlaybackInfo 协商、播放会话与受限资源代理 |
| `quartz-server/internal/jellyfin/hls.go` | 首播/续播清单及前置片段准备；实际文件以 Go 模块为准 |
| `quartz-server/internal/jellyfin/decision.go` | 画质和 PlaybackInfo 参数、Jellyfin 返回方案 |
| `quartz-server/internal/jellyfin/document.go` | 媒体域受控播放器文档与来源校验 |
| `jellyfin/player.ts` | 装配播放器及独立模块、状态与错误界面、进度保存 |
| `jellyfin/controller.ts` | 初始加载、续播、换源、播放意图、取消、超时、恢复 |
| `jellyfin/transport.ts` | HLS.js/MSE 或浏览器原生加载、释放媒体引擎 |
| `jellyfin/subtitles.ts` | 字幕选择、渲染、原生全屏切换、字体/偏移，不维护第二条时间轴 |
| `jellyfin/danmaku.ts` | 在线匹配、手动搜索、离线弹幕、提示与取消 |
| `jellyfin/danmakuLoader.ts` | 有界批次载入弹幕，让出时间处理输入、视频和网络事件 |
| `jellyfin/controls.ts` | 界面操作与成功后确认选择，失败恢复原选项 |

### 一次播放

`Share 媒体页 → OpenList fs/get 授权 → 精确匹配 Jellyfin 物理路径 → 浏览器官方能力配置 → PlaybackInfo → 采用返回的直接播放/转封装/转码方案 → 授权票据 → 媒体域播放器 → video`

桥接服务不编码视频、不扫描媒体文件提取字幕、不解码 PGS、不自行把 ASS 转成 VTT。它已合并到同级 quartz-server 的 Go 服务中，负责本站分享权限与 Jellyfin 访问凭据之间的边界；浏览器只能获得匹配项目的临时资源地址。

受控播放器在媒体域运行，因此有真实来源，避免 opaque `srcdoc` 的 `Origin: null` 局域网访问限制。它与博客仍然跨域，不能读取博客 DOM；只允许指定父窗口和随机 channel 的消息。普通文件预览继续使用隔离的 `srcdoc`，不加载 Jellyfin 或弹幕组件。

### 画质与时间轴

- 使用本地固定版本的 Jellyfin Web 10.11.11 浏览器能力生成器与 HLS 选择规则，不按浏览器名字手写一套编解码器表。
- 自动：测速并保留安全余量后，把码率约束交给 Jellyfin；不能把它理解为必定原画或必定转码。
- 原画：保留片源尺寸，以声明的源码率协商；编解码器或音轨不兼容时 Jellyfin 仍可能转码。不是无界的 2 Gbps 编码目标。
- 固定档位：同时提交最大宽、高与码率。Jellyfin 会忽略只有最大高度的约束，因此两个维度必须一起提交。裁剪过的宽屏 4K 仍提供对应档位。
- `video.currentTime` 是唯一时间轴。HLS.js `startPosition` 决定获取的片段，metadata 到来时也要把暂停的视频定位到续播处，不能先等 canplay 再定位。
- fMP4 续播先让 Jellyfin 准备目标片段，避免 init 请求先从零点启动编码器。按 EXTINF 找片段，不假设固定片长。不连续请求先读取一个前置片段，让编码器产出可解码的目标帧；只对首段进行预热，正常连续请求不重复预热。
- 烧录字幕使用客户端官方 TS 能力方案，不经过已复现超时和无画面的 fMP4/HEVC 路径。保持分辨率、码率与音轨约束，编码仍由 Jellyfin 完成；普通文本轨及关闭字幕后的直接播放能力按原规则协商。TS 没有 fMP4 初始化片段，不执行重复的前置片段预热。
- 从零开始播放也等待首片段准备完成，再交付播放票据。否则冷编码器超过浏览器片段等待时间时，会出现数据随后已到、界面却已经报错的状态。首次播放和续播共用准备函数与超时，不能跳过零点入口。
- 换画质/音轨/烧录字幕走同一个 `load()`；新源在目标时间就绪后才提交，旧会话在提交后释放。协商失败继续使用旧源；新流失败尝试恢复旧源，有明确超时和重试入口。
- 暂停时跨缓冲区拖动会唤醒 HLS 片段加载。目标片段已追加、实际缓冲区仍缺失该时间点时，按实际解码失败处理，请 Jellyfin 重新协商兼容编码。每次拖动最多尝试一次，保留档位、位置、音轨和字幕；不排除 4K，不切回普通播放器，也不循环重挂 MSE。
- 对已缓冲却无法完成的拖动，以及声音时间推进但连续 8 秒没有实际视频帧的情况，请求同一个有界兼容恢复。后台标签页、暂停和正在换源不计入；换源后重新注册帧回调，避免 WebKit 清理旧回调后误判。
- 检查 HLS.js 提供的 fMP4 初始时间戳。已复现片段相对清单偏移约 5.67 秒、画面与外置字幕错位；明显偏移时采用同一份 Jellyfin Web 能力配置中的 TS 兼容方案，由 Jellyfin 重新编码。不会把偏移写进字幕或另外维护一条播放时钟。兼容方案在本次播放器生命周期内保留，后续画质、音轨和字幕切换沿用；离开影片后重新判断。
- 片段请求等待 45 秒，覆盖实测约 41 秒的冷编码器准备；不能让 HLS 的 20 秒默认值反复中止有效请求。仍低于控制器 60 秒的整体缓冲时限，超时提供重试。
- 高码率的 6 秒缓冲只用于上游指定的 Chromium/Firefox，其他浏览器保留 30 秒。策略使用同版本 Jellyfin Web 的浏览器判断。
- 网络缓冲、拖动、换源显示加载状态；真正暂停才显示暂停图标。字幕和弹幕加载状态在右上角独立排列。
- 直接文件的 HTTP 响应可以维持数小时。连接响应超时不再等于整段电影的下载时限；离页立即中止请求和本次编码任务。

`playMethod: Transcode` 也可能仅转音频并复制视频；`streamParameters.VideoCodec` 是候选列表，不是实际输出。诊断里的实际尺寸、HLS codec，以及 Jellyfin 的编码任务可用于确认最终播放。

### 字幕交付

| 字幕 | 默认路径 | 时序与回退 |
| --- | --- | --- |
| SubRip/SRT、WebVTT、其他 Jellyfin 标记的文本轨（如 MOV_TEXT） | Jellyfin 输出 WebVTT，浏览器原生 cue | 保留原时间，清理 ASS 控制串；换源清空浏览器 cue 时从已读文本重新挂载，不重新提取 |
| ASS/SSA | 现有 Fontinass → ASS/内嵌字体 → libass WASM | 跟随同一个 video；等待 worker 真正初始化，失败协商 Jellyfin 烧录 |
| PGS 默认 | Jellyfin 烧录，使用客户端官方 TS 能力方案 | 不在前端等待整部电影提取 SUP；换字幕属于换源，保留时间、画质、音轨和播放意图 |
| PGS 可选浏览器渲染 | Jellyfin/Fontinass 原始 SUP → 上游 libpgs 0.8.1 | 受字幕提取缓存与文件读取影响；不支持或失败时请求 Jellyfin 烧录 |
| DVD 等其他图像字幕 | Jellyfin 烧录 | 使用 Jellyfin 的轨道类型，不能因为不在客户端格式表里就隐藏 |
| 原生视频全屏/PiP | 原生文本轨道；无法携带的画布字幕使用原生文本或烧录 | 需要真实设备验证；不能把 Linux WebKit 测试当作 iPhone 验收 |

初始字幕异步加载，不阻塞视频就绪；用户手动换字幕时保留原有暂停/恢复体验。关闭字幕、单音轨、无跳过锚点等情况按现有规则隐藏无效操作。

最初的播放协商也作为同一个 `load()` 的输入，不能等 API 返回后再开始记录操作。用户在加载期间点击播放或暂停，图标、提示和最终状态都使用最近一次意图；切换时冻结旧流，避免请求尚未结束旧画面继续走而新流回到先前位置。

浏览器的 `pause` / `play` 事件异步到达，不能把内部暂停再算成一次用户操作。控制器核对视频当前状态与既有播放意图，切字幕后仅在用户没有另外操作时恢复；过期的暂停、缓冲和结束事件不能覆盖当前状态。真实浏览器测试分别检查自动恢复与主动暂停，避免只验证“字幕加载成功”。

尺寸监听只合并到下一帧写入，且只在高度确实变化时通知父页面，避免移动网页全屏时出现 `ResizeObserver` 布局反馈。

后台字幕就绪只更新字幕勾选状态并保留当前子菜单；弹幕组件的菜单项目在设置关闭后加入。ArtPlayer 的 `check()` / `add()` 会导航或重建菜单，不能在后台完成时直接打断用户选择画质。

### 弹幕与整页阻塞

匹配独立于播放：带 ` @bilibili` 尝试一次，无结果再去掉后缀尝试一次。保留手动搜索、离线来源和右上角来源/数量提示。

异步请求并不保证不会卡主线程。ArtPlayer 弹幕插件 5.2.0 的初始插入及 reset 会反复过滤整个等待队列，形成平方级开销；大量弹幕能让已经返回的播放响应迟迟得不到处理。对本地固定版本做了保留语义的线性队列修补，并使用分批载入；具体补丁见 [PATCHES.md](../../quartz/static/vendor/artplayer-plugin-danmuku/5.2.0/PATCHES.md)。不能删除此补丁后仅依靠 Promise 认为播放已与弹幕隔离。

### 诊断与边界

播放器文档控制台的 `window.__quartzMedia.snapshot` 提供实际播放方式、视频尺寸、HLS codec、缓冲区、视频帧数、字幕格式与活动 cue；不包含 API Key 或源文件路径。普通文件播放器不提供这个对象。

这不是把整个 Jellyfin Web 嵌入本站。其播放决策和编码能力来自 Jellyfin，浏览器能力与渲染器采用固定上游版本；本站仍负责界面、分享权限、偏好/续播缓存、会话提交与弹幕。Jellyfin 用户观看历史同步不在本次范围。

## 验收原则

- 单元测试覆盖状态、换源、取消、超时及偏好。
- 使用已部署 Jellyfin 和真实影片，不以模拟请求替代实播。
- Chromium、Firefox、WebKit 分开记录；桌面、移动视口、触摸、原生 HLS 与 MSE 分开测试。
- 真实 iPhone/Safari、硬件解码/HDR 输出不能被 Linux WebKit 或 UA 模拟替代，明确标记验证边界。
- 使用 ASS/SSA、SubRip/SRT、WebVTT、PGS、无字幕，覆盖续播、拖动、字幕/音轨/画质切换。
- 记录实际播放帧、播放时间推进、字幕 cue、错误及会话释放；不以页面出现或 HTTP 200 作为通过。

实际结果见 [测试记录](./validation.md)。本目录不保存凭据、Cookie、分享提取码或 API Key。失败的开发阶段测试不计入最终通过数量。

## 对照的上游实现

以同版本 Jellyfin Web 10.11.11 为依据，便于检查哪些决策来自上游：

- [浏览器能力生成](https://github.com/jellyfin/jellyfin-web/blob/v10.11.11/src/scripts/browserDeviceProfile.js)：本地固定版本，运行时检测当前浏览器。
- [原生 HLS / HLS.js 选择](https://github.com/jellyfin/jellyfin-web/blob/v10.11.11/src/components/htmlMediaHelper.js)：保留 iOS、桌面 Safari、Chromium 等上游条件。
- [播放器缓冲策略](https://github.com/jellyfin/jellyfin-web/blob/v10.11.11/src/plugins/htmlVideoPlayer/plugin.js)：高码率短缓冲只用于指定浏览器。
- [播放源与 Static 流选择](https://github.com/jellyfin/jellyfin-web/blob/v10.11.11/src/components/playback/playbackmanager.js)：采用返回的 SupportsDirectPlay / SupportsDirectStream / TranscodingUrl，不自行把所有媒体强制改成 HLS。
