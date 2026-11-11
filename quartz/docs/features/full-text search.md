---
title: Full-text Search
tags:
  - component
---

本站全站搜索由 Go 后端的 `/api/site/content/search` 提供，使用服务器维护的文章、分享、仓库和视频统一索引。浏览器不再建立独立的 FlexSearch 索引。

It can be opened by either clicking on the search bar or pressing `⌘`/`ctrl` + `K`. The top 5 search results are shown on each query. Matching subterms are highlighted and the most relevant 30 words are excerpted. Clicking on a search result will navigate to that page.

To search content by tags, you can either press `⌘`/`ctrl` + `shift` + `K` or start your query with `#` (e.g. `#components`).

This component is also keyboard accessible: Tab and Shift+Tab will cycle forward and backward through search results and Enter will navigate to the highlighted result (first result by default). You are also able to navigate search results using `ArrowUp` and `ArrowDown`.

> [!info]
> 本站搜索读取 Go 的 `/api/site/content/search`，不依赖静态索引文件。

### Indexing Behaviour

By default, it indexes every page on the site with **Markdown syntax removed**. This means link URLs for instance are not indexed.

搜索按服务器规则匹配关键词和标题。仅链接可访问的隐藏内容不进入公开搜索；加密内容不公开正文。

## Customization

- Removing search: delete all usages of `Component.Search()` from `quartz.layout.ts`.
- Component: `quartz/components/Search.tsx`
- Style: `quartz/components/styles/search.scss`
- Script: `quartz/components/scripts/search.inline.ts`
  - You can edit `contextWindowWords`, `numSearchResults` or `numTagResults` to suit your needs
