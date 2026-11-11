---
title: SiteMap
---

`Plugin.SiteMap()` 只生成 `sitemap.xml` 和页面中的 RSS 发现链接。它不再生成浏览器内容索引。

本站搜索、目录、标签、星轨图、流新与拾遗统一使用 Go 后端的 `/api/site/content`；搜索使用 `/api/site/content/search`。文章成功构建及热更新会发布私有快照，供 Go 更新服务器索引。

RSS 由 Go 的统一四源索引在 `/index.xml` 提供。

可选项：`enableSiteMap`、`enableRSS`，默认均为 `true`。后者控制发现链接，不在 Quartz 内生成 RSS。

源码：`quartz/plugins/emitters/siteMap.tsx`。
