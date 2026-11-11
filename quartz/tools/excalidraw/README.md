# Excalidraw 只读绘图

无需额外服务。Quartz 的 `Excalidraw` transformer 在 Obsidian 删除 `%%` 注释前提取绘图，兼容 `compressed-json` 与 `json`；保留笔记 front matter，绘图数据随文章正文一起输出，使用现有文章加密流程，不单独输出公开场景文件。

浏览器仅在文章包含绘图时按需加载本站的 `@excalidraw/utils`，用官方 `exportScene` 生成矢量 SVG。查看控件支持鼠标拖动、滚轮缩放、触摸拖动、双指缩放、键盘方向键、加减缩放、适应窗口及全屏。明暗主题切换重新生成 SVG 并保留视角。iPhone/iPad 全屏复用正常文档流方案，不创建固定 iframe。

普通文章不下载渲染库或绘图字体。官方工具包内嵌的 WOFF2 字体拆成本地资源，只加载当前绘图用到的字形子集。网页嵌入不执行；此版本不提供编辑和回写。

更新本地资源：

```sh
cd tools/excalidraw
npm ci
npm run build
```

`package-lock.json` 固定依赖。构建脚本输出 `quartz/static/vendor/excalidraw`、资源校验和和客户端缓存版本；保留生成的 `renderer.js.LEGAL.txt`。官方项目及 API：

- https://github.com/excalidraw/excalidraw
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export
