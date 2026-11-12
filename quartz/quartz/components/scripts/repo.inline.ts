import {PageNotFoundError,showSiteNotFound} from "./siteError"
import {fileNameIcon,fileTypeIcons} from '../../util/fileTypeIcons'
import {readContentCatalog} from './contentCatalog'
import {markdown,library,runtime} from "./repoMarkdown"
import { activateDirectoryGroup } from "./directoryGroups"
import { setPageModified, latestPageDate } from "./pageModified"
import { createRepoViewNavigation } from "./repoViewNavigation"
import { repoSidebar, repoCatalogSidebar } from "./repoSidebar"
import { setupRepoDirectories, prepareRepoDirectoryNavigation } from "./repoNavigation"
import { sameRepo } from "./repoNavigationScope"
import { updateRepoHeading } from "./repoHeading"
import { repoCatalogView, repoCatalogHref, repoFiles, repoLatestCommit, repoCommitAvatar, type RepoSort, type RepoCommit, type RepoEntry } from "./repoList"
import { readRepoCatalog, peekRepoCatalog, repoRequest, repoCachedRequest } from "./repoClient"
import { repoApi, repoEscape as e, repoHref, repoIcons as icons, repoRoute, type RepoInfo } from "./repoShared"

type Entry = RepoEntry
type FileResult = { content: string; path: string; binary: boolean; truncated: boolean; sha: string }
type Commit = { sha: string; subject: string; author: string; date: string }
type Release = { name: string; tag: string; body: string; publishedAt: string; prerelease: boolean; url: string; sourceZip: string; assets: { name: string; size: number; url: string; downloads: number }[] }
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—"
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>'
const compareIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/></svg>'
const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>'
const copiedIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'
const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>'
const downloadIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>'
const bytes = (value: number) => value > 1048576 ? `${(value / 1048576).toFixed(1)} MiB` : `${Math.max(1, Math.round(value / 1024))} KiB`
const message = (text: string) => `<div class="repo-empty">${icons.repo}<p>${e(text)}</p></div>`
const loading = () => '<div class="repo-inline-loading" role="status" aria-label="正在读取"></div>'
const link = (href: string, text: string, className = "") => `<a class="${className}" href="${e(href)}" data-no-popover="true">${e(text)}</a>`
const external = (href: string, text: string) => `<a href="${e(href)}" target="_blank" rel="noopener noreferrer" data-router-ignore="true" data-no-popover="true">${e(text)} ↗</a>`


let localNavigation: { root: HTMLElement; url: URL; navigate: (url: URL, push?: boolean, force?: boolean) => void } | undefined
let searchScroll: { root: HTMLElement; url: string; catalog?:boolean } | undefined

document.addEventListener("click", event => {
  if (!localNavigation?.root.isConnected || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  if (!(event.target instanceof Element)) return
  if (event.target.closest('.repo-markdown img:not([no-view]), .repo-image img:not([no-view])')) return
  const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]")
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.hasAttribute("data-router-ignore")) return
  const target = new URL(anchor.href)
  if (!sameRepo(localNavigation.url, target)) return
  if (target.pathname === location.pathname && target.search === location.search && target.hash) return
  prepareRepoDirectoryNavigation(anchor)
  searchScroll = anchor.closest("[data-repo-search-results]") ? {root:localNavigation.root,url:target.href} : anchor.hasAttribute("data-catalog-page-link") ? {root:localNavigation.root,url:target.href,catalog:true} : undefined
  event.preventDefault(); event.stopImmediatePropagation()
  if (anchor.closest(".explorer-content") && matchMedia("(max-width: 800px)").matches) {
    const explorer = anchor.closest<HTMLElement>(".explorer")!
    explorer.classList.add("collapsed"); explorer.setAttribute("aria-expanded", "false")
    explorer.querySelector(".mobile-explorer")?.setAttribute("aria-expanded", "false")
    document.documentElement.classList.remove("mobile-no-scroll")
  }
  localNavigation.navigate(target)
}, { capture: true })
window.addEventListener("popstate", event => {
  if (!localNavigation?.root.isConnected || !sameRepo(localNavigation.url, new URL(location.href))) return
  searchScroll = undefined
  event.stopImmediatePropagation(); localNavigation.navigate(new URL(location.href), false)
}, { capture: true })

document.addEventListener("nav", () => {
  const root = document.querySelector<HTMLElement>("[data-repo-page]")
  if (!root) return
  const frame = root.closest<HTMLElement>(".repo-frame")!
  const positionLoading = () => {
    const bounds = root.getBoundingClientRect()
    frame.style.setProperty("--repo-loader-x", `${(Math.max(0, bounds.left) + Math.min(innerWidth, bounds.right)) / 2}px`)
  }
  positionLoading()
  const resize = new ResizeObserver(positionLoading); resize.observe(root)
  window.addEventListener("resize", positionLoading, { passive: true })
  let searchScrollFrame: number | undefined
  const navigation = createRepoViewNavigation(new URL(location.href), {
    render: (_url, signal) => renderRepo(root, signal),
    busy: pending => {
      root.setAttribute("aria-busy", String(pending))
      const content = root.querySelector<HTMLElement>("[data-repo-content]")
      if (content) content.inert = pending
      const stage = root.querySelector<HTMLElement>(".repo-view-stage")
      const overlay = root.querySelector<HTMLElement>("[data-repo-view-loading]")
      const targetTab = repoRoute(new URL(location.href)).tab
      const changingTab = pending && (targetTab !== (root.dataset.repoRenderedTab || "code") || targetTab === "releases" || targetTab === "commits")
      stage?.classList.toggle("is-loading", changingTab)
      if (overlay) {
        overlay.hidden = !changingTab
        overlay.querySelector<HTMLElement>("[data-repo-loading-label]")!.textContent = targetTab === "releases" ? "正在读取发布版本" : targetTab === "commits" ? "正在读取提交记录" : "正在读取代码"
        if (changingTab) frame.querySelector("[data-repo-initial-loading]")?.remove()
      }
      if (!pending) frame.querySelector("[data-repo-initial-loading]")?.remove()
    },
    push: url => { if (location.href !== url.href) history.pushState({}, "", url) },
    anchor: url => { if (url.hash) { try { document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView() } catch {} } },
    updateDirectory: () => { activateDirectoryGroup({ domain: "explore", root: "Repo" }); setupRepoDirectories() },
    ready: url => {
      root.dataset.repoRenderedTab = repoRoute(url).tab
      if (searchScroll?.root !== root || searchScroll.url !== url.href) return
      const catalog = searchScroll.catalog
      searchScroll = undefined
      if (searchScrollFrame !== undefined) cancelAnimationFrame(searchScrollFrame)
      searchScrollFrame = requestAnimationFrame(() => {
        searchScrollFrame = undefined
        if (!root.isConnected || location.href !== url.href || root.getAttribute("aria-busy") === "true") return
        const target = catalog ? root.querySelector<HTMLElement>("[data-repo-catalog-section]") : root.querySelector<HTMLElement>("[data-repo-browser] .repo-panel") || root.querySelector<HTMLElement>("[data-repo-browser]") || root.querySelector<HTMLElement>("[data-repo-content]")
        target?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",block:"start"})
      })
    },
  })
  const controller = { root, get url() { return navigation.url }, navigate: navigation.navigate }
  localNavigation = controller
  window.addCleanup(() => { navigation.dispose(); resize.disconnect(); window.removeEventListener("resize", positionLoading); if (searchScrollFrame !== undefined) cancelAnimationFrame(searchScrollFrame); if (searchScroll?.root === root) searchScroll = undefined; if (localNavigation === controller) localNavigation = undefined })
  navigation.navigate(new URL(location.href), false)
})

async function renderRepo(root: HTMLElement, signal: AbortSignal) {
  if (signal.aborted) return
  const route = repoRoute(new URL(location.href))
  if (!root.dataset.repoName) {
    const known = peekRepoCatalog()?.repositories.find(repo => repo.name.toLowerCase() === route.name.toLowerCase())
    if (route.name && !known) root.closest(".center")?.querySelector<HTMLElement>(".article-title")?.style.setProperty("visibility", "hidden")
    else updateRepoHeading(known)
  }
  const sidebar = document.querySelector<HTMLElement>("[data-repo-aside]")
  const graph = document.querySelector<HTMLElement>("[data-repo-graph]")
  const showGraph = (name = "") => {
    if (!graph || graph.dataset.repoNode === name) return
    graph.hidden = !name
    graph.dataset.repoNode = name
    document.dispatchEvent(new CustomEvent("repo-graph-ready"))
  }
  const go = (values: Record<string, string | undefined>) => localNavigation?.navigate(new URL(repoHref(route.name, values), location.origin))
  const params = (extra: Record<string, string> = {}) => ({ ...(route.ref ? { ref: route.ref } : {}), ...extra })
  const read = <T>(action: string, extra: Record<string, string> = {}) => repoCachedRequest<T>(repoApi(route.name, action, params(extra)))
  const renderError = (error: unknown) => {
    if (signal.aborted) return
    if(error instanceof PageNotFoundError){showSiteNotFound();return}
    updateRepoHeading(peekRepoCatalog()?.repositories.find(repo => repo.name.toLowerCase() === route.name.toLowerCase()))
    const target = root.querySelector<HTMLElement>("[data-repo-content]") || root
    target.innerHTML = `${message(error instanceof Error ? error.message : "仓库读取失败")}<button class="repo-button" data-repo-reload>重新加载</button>`
    target.querySelector("[data-repo-reload]")?.addEventListener("click", () => localNavigation?.navigate(new URL(location.href), false, true), { signal })
  }
  try {
    await readContentCatalog().catch(()=>undefined)
    if(signal.aborted)return
    if (!route.name) {
      const data = await readRepoCatalog()
      if (signal.aborted) return
      const repos = data.repositories.filter(r => !route.language || (r.language || "其他") === route.language)
      if(route.language&&!repos.length)throw new PageNotFoundError("语言分类不存在")
      setPageModified(root.closest(".center")!, latestPageDate(repos.map(repo => repo.pushed_at)))
      showGraph()
      const requestedSort=new URL(location.href).searchParams.get("sort")
      const order:RepoSort=requestedSort==="name"||requestedSort==="language"?requestedSort:"updated"
      root.innerHTML = repoCatalogView(data.repositories,route.language,order,Number(new URL(location.href).searchParams.get("page")))
      root.querySelector<HTMLSelectElement>("[data-repo-catalog-sort]")!.addEventListener("change", event => {
        localNavigation?.navigate(new URL(repoCatalogHref(route.language,(event.target as HTMLSelectElement).value as RepoSort),location.origin))
      }, {signal})
      if (sidebar) {
        const markup=repoCatalogSidebar(data)
        if(sidebar.dataset.repoSignature!==markup){sidebar.innerHTML=markup;sidebar.dataset.repoSignature=markup}
      }
        return
    }
    const info = await read<RepoInfo>("info")
    if (signal.aborted) return
    const ref = route.ref ? info.branches.includes(route.ref) ? `refs/heads/${route.ref}` : info.tags.includes(route.ref) ? `refs/tags/${route.ref}` : route.ref : `refs/heads/${info.default_branch}`
    updateRepoHeading(info)
    showGraph(info.name)
    const retainedShell = root.dataset.repoName === info.name && Boolean(root.querySelector("[data-repo-content]"))
    if (!retainedShell) {
      root.innerHTML = `<div class="repo-project-summary"><p class="repo-description">${e(info.description || "暂无项目简介").replace(/\n/g, "<br />")}</p></div><nav class="repo-tabs" aria-label="仓库内容">${[["code", "代码"], ["commits", "提交记录"], ["releases", "发布版本"]].map(([tab, title]) => `<a href="${e(repoHref(info.name, { ref: route.ref, tab: tab === "code" ? undefined : tab }))}" class="${route.tab === tab ? "is-active" : ""}" data-no-popover="true">${tab === "code" ? icons.code : tab === "commits" ? icons.history : icons.tag}<span>${e(title)}</span></a>`).join("")}</nav><div class="repo-branch-bar"><label class="repo-ref-select">${icons.branch}<select data-repo-ref aria-label="选择分支或标签">${info.branches.map(b => `<option value="${e("refs/heads/" + b)}" ${b === ref || "refs/heads/" + b === ref ? "selected" : ""}>${e(b)}</option>`).join("")}${info.tags.map(t => `<option value="${e("refs/tags/" + t)}" ${"refs/tags/" + t === ref || t === ref && !info.branches.includes(ref) ? "selected" : ""}>标签 · ${e(t)}</option>`).join("")}${!info.branches.some(b => b === ref || "refs/heads/" + b === ref) && !info.tags.some(t => t === ref || "refs/tags/" + t === ref) ? `<option selected value="${e(ref)}">${e(ref.slice(0, 12))}</option>` : ""}</select></label><div class="repo-ref-meta"><span>${icons.branch}${info.branches.length} 个分支</span><span>${icons.tag}${info.tags.length} 个标签</span></div></div><div class="repo-view-stage"><div data-repo-content></div><div class="repo-view-loading" data-repo-view-loading hidden role="status"><span class="drive-loading" aria-hidden="true"><i /></span><span data-repo-loading-label>正在读取仓库内容</span></div></div>`
      root.dataset.repoName = info.name
    }
    root.querySelector<HTMLSelectElement>("[data-repo-ref]")!.value = ref
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>(".repo-tabs > a")) {
      const tab = repoRoute(new URL(anchor.href)).tab
      anchor.href = repoHref(info.name, { ref: route.ref || undefined, tab: tab === "code" ? undefined : tab })
      anchor.classList.toggle("is-active", tab === route.tab)
      if (tab === route.tab) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current")
    }
    root.querySelector<HTMLSelectElement>("[data-repo-ref]")!.addEventListener("change", event => void go({ ref: (event.target as HTMLSelectElement).value, tab: route.tab, path: undefined }), { signal })
    const sidebarMarkup = repoSidebar(info, ref)
    const sidebarSignature = JSON.stringify([info.name, info.description, info.language, info.stargazers_count, info.forks_count, info.branches, info.tags, info.sha, info.topics, info.license, ref])
    if (sidebar && sidebar.dataset.repoSignature !== sidebarSignature) {
      sidebar.innerHTML = sidebarMarkup; sidebar.dataset.repoSignature = sidebarSignature
    }
    const content = root.querySelector<HTMLElement>("[data-repo-content]")!
    const showReadme = async (host: HTMLElement, folder = "") => {
      const readme = await read<FileResult>("readme", { path: folder })
      if (signal.aborted) return
      if (!readme.path) { host.remove(); return }
      host.innerHTML = `<header class="repo-readme-header">${fileTypeIcons.text}<span>README</span></header><div class="repo-markdown" data-repo-readme></div>`
      const body = host.querySelector<HTMLElement>("[data-repo-readme]")!
      if (/\.(md|markdown|mdown)$/i.test(readme.path)) await markdown(body, readme.content, readme.path, info, ref, signal)
      else { const pre = document.createElement("pre"); pre.textContent = readme.content; body.append(pre) }
      if (readme.truncated && !signal.aborted) body.insertAdjacentHTML("beforeend", '<p class="repo-notice">README 过长，仅显示前 2 MiB。</p>')
    }
    const showFile = async (target: HTMLElement, path: string, file: FileResult) => {
      if (signal.aborted) return
      const parent = path.split("/").slice(0, -1).join("/")
      const canCopy = !file.binary && !/\.(png|jpe?g|gif|webp|avif)$/i.test(path)
      target.innerHTML = `<div class="repo-path"><span>${link(repoHref(info.name, { ref: route.ref, path: parent }), "← 返回目录")}</span><strong>${e(path)}</strong></div><section class="repo-panel"><header class="repo-panel-header"><span>${e(path.split("/").pop())}</span><div class="repo-file-actions">${canCopy ? `<button type="button" class="repo-icon-action" data-repo-copy aria-label="复制代码" title="复制代码">${copyIcon}</button>` : ""}<a class="repo-icon-action" href="${e(repoApi(info.name, "raw", { ref, path }))}" data-router-ignore="true" download aria-label="下载文件" title="下载文件">${downloadIcon}</a></div></header><div data-repo-file></div></section>`
      const copyButton = target.querySelector<HTMLButtonElement>("[data-repo-copy]")
      if (copyButton) {
        let feedback: ReturnType<typeof setTimeout> | undefined
        signal.addEventListener("abort", () => clearTimeout(feedback), { once: true })
        copyButton.addEventListener("click", async () => {
          copyButton.disabled = true
          try {
            await navigator.clipboard.writeText(file.content)
            if (signal.aborted) return
            copyButton.innerHTML = copiedIcon; copyButton.title = "已复制"; copyButton.setAttribute("aria-label", "已复制")
            clearTimeout(feedback)
            feedback = setTimeout(() => { copyButton.innerHTML = copyIcon; copyButton.title = "复制代码"; copyButton.setAttribute("aria-label", "复制代码") }, 1500)
          } catch { copyButton.title = "复制失败，请重试"; copyButton.setAttribute("aria-label", "复制失败，请重试") }
          finally { copyButton.disabled = false }
        }, { signal })
      }
      const host = target.querySelector<HTMLElement>("[data-repo-file]")!
      if (/\.(png|jpe?g|gif|webp|avif)$/i.test(path)) host.innerHTML = `<div class="repo-image"><img src="${e(repoApi(info.name, "raw", { ref, path }))}" alt="${e(path)}" /></div>`
      else if (file.binary) host.innerHTML = message("二进制文件不提供文本预览，可下载查看。")
      else if (/\.(md|markdown|mdown)$/i.test(path)) { host.className = "repo-markdown"; await markdown(host, file.content, path, info, ref, signal) }
      else {
        const count = file.content.split("\n").length
        host.innerHTML = `<div class="repo-code"><pre class="repo-line-numbers" aria-hidden="true">${Array.from({ length: count }, (_, i) => i + 1).join("\n")}</pre><pre><code></code></pre></div>`
        const code = host.querySelector<HTMLElement>("code")!; code.textContent = file.content
        try {
          await library("highlightjs/11.11.1/highlight.min.js")
          if (!signal.aborted) {
            const ext = path.split(".").pop()!.toLowerCase(), language = ({ ts: "typescript", tsx: "typescript", py: "python", yml: "yaml", sh: "bash", rs: "rust" } as Record<string, string>)[ext] || ext
            code.className = runtime.hljs!.getLanguage(language) ? `language-${language}` : "language-plaintext"
            runtime.hljs!.highlightElement(code)
          }
        } catch { /* Plain text remains usable without syntax highlighting. */ }
      }
      if (file.truncated) host.insertAdjacentHTML("afterend", '<p class="repo-notice">文件过长，仅显示前 2 MiB。下载可查看完整内容。</p>')
    }
    if (route.tab === "code") {
      let fileNames: Promise<{ files: string[]; truncated: boolean }> | undefined
      let searchController: AbortController | undefined
      const view = await read<({ type: "directory"; entries: Entry[]; truncated: boolean; latestCommit?: RepoCommit; historyComplete?: boolean } | { type: "submodule" } | ({ type: "file" } & FileResult))>("browse", { path: route.path })
      if (signal.aborted) return
      if (!content.querySelector("[data-repo-search]")) {
        content.innerHTML = `<form class="repo-search" data-repo-search><select name="mode" aria-label="查找方式"><option value="files">文件查找</option><option value="code">全文搜索</option></select><input name="query" type="search" placeholder="输入文件名或路径" aria-label="搜索当前分支" maxlength="200"/><button class="repo-download" type="submit" data-repo-find aria-label="查找" title="查找" disabled>${searchIcon}</button><a class="repo-download" data-repo-source-download href="${e(repoApi(info.name, "archive", { ref }))}" data-router-ignore="true" download aria-label="下载仓库源码" title="下载源码">${downloadIcon}</a></form><div data-repo-search-results></div><div data-repo-browser></div>`
      }
      const searchForm = content.querySelector<HTMLFormElement>("[data-repo-search]")!, searchResults = content.querySelector<HTMLElement>("[data-repo-search-results]")!
      if (content.dataset.codeRef && content.dataset.codeRef !== ref) searchResults.replaceChildren()
      content.dataset.codeRef = ref
      const searchInput = searchForm.querySelector<HTMLInputElement>('input[name="query"]')!
      const searchButton = searchForm.querySelector<HTMLButtonElement>("[data-repo-find]")!
      const updateSearch = () => { searchButton.disabled = !searchInput.value.trim() }
      searchInput.addEventListener("input", updateSearch, { signal }); updateSearch()
      content.querySelector<HTMLAnchorElement>("[data-repo-source-download]")!.href = repoApi(info.name, "archive", { ref })
      searchForm.querySelector<HTMLSelectElement>("select")!.addEventListener("change", event => {
        searchForm.querySelector<HTMLInputElement>("input")!.placeholder = (event.target as HTMLSelectElement).value === "files" ? "输入文件名或路径" : "搜索当前分支中的文本"
      }, { signal })
      searchForm.addEventListener("submit", async event => {
        event.preventDefault(); searchController?.abort(); searchController = new AbortController()
        const searchSignal = AbortSignal.any([signal, searchController.signal]), values = new FormData(searchForm), q = String(values.get("query") || "").trim()
        if (!q) return
        searchResults.innerHTML = loading()
        try {
          let resultHtml = "", truncated = false
          if (values.get("mode") === "files") {
            fileNames ||= read<{ files: string[]; truncated: boolean }>("files").catch(error => { fileNames = undefined; throw error })
            const files = await fileNames
            const matches = files.files.filter(f => f.toLowerCase().includes(q.toLowerCase()))
            truncated = files.truncated || matches.length > 100
            resultHtml = matches.slice(0, 100).map(path => `<li>${link(repoHref(info.name, { ref: route.ref, path }), path)}</li>`).join("")
          } else {
            const result = await repoRequest<{ results: { path: string; line: number; text: string }[]; truncated: boolean }>(repoApi(info.name, "search", { ref, q }), searchSignal)
            truncated = result.truncated
            resultHtml = result.results.map(row => `<li>${link(repoHref(info.name, { ref: route.ref, path: row.path }), `${row.path}:${row.line}`)}<pre>${e(row.text)}</pre></li>`).join("")
          }
          if (searchSignal.aborted) return
          searchResults.innerHTML = `<section class="repo-panel"><header class="repo-panel-header"><span>查找结果 · ${e(q)}</span><button class="repo-icon-action" type="button" data-close-results aria-label="收起查找结果" title="收起">${closeIcon}</button></header>${resultHtml ? `<ul class="repo-search-results">${resultHtml}</ul>` : message("当前分支没有找到相关内容")}${truncated ? '<p class="repo-notice">结果较多，仅展示前 100 条，请缩小搜索范围。</p>' : ""}</section>`
          searchResults.querySelector("[data-close-results]")?.addEventListener("click", () => { searchResults.replaceChildren() }, { signal })
        } catch (error) { if (!searchSignal.aborted) searchResults.innerHTML = message(error instanceof Error ? error.message : "搜索失败") }
      }, { signal })
      signal.addEventListener("abort", () => searchController?.abort(), { once: true })
      // Use a separate browser host: searches do not replace directory/file content.
      const visibleBrowser = content.querySelector<HTMLElement>("[data-repo-browser]")!
      const browser = document.createElement("div")
      let listing: { entries: Entry[]; truncated: boolean; latestCommit?: RepoCommit; historyComplete?: boolean } | undefined
      if (view.type === "directory") listing = view
      else if (view.type === "submodule") browser.innerHTML = message("此目录是 Git 子模块，请在源仓库查看对应项目。")
      else await showFile(browser, route.path, view)
      if (listing && !signal.aborted) {
        const folder = route.path
        browser.innerHTML = `<nav class="repo-path" aria-label="代码路径">${link(repoHref(info.name,{ref:route.ref}),info.name)}${folder.split("/").filter(Boolean).map((part,index,parts) => `<span>/</span>${link(repoHref(info.name,{ref:route.ref,path:parts.slice(0,index+1).join("/")}),part)}`).join("")}<span class="repo-path-count">${listing.entries.length} 项</span></nav><section class="repo-code-tree">${repoLatestCommit(listing.latestCommit,info.name,route.ref)}${repoFiles(listing.entries, info.name, route.ref, folder)}</section>${listing.historyComplete === false ? `<p class="repo-notice">部分较早的文件提交信息未在本次历史范围内找到。</p>` : ""}${listing.entries.some(entry => entry.type === "file" && /^readme(?:\.(md|markdown|mdown|txt|rst))?$/i.test(entry.name)) ? `<section class="repo-panel repo-readme" data-readme-panel></section>` : ""}`
        browser.querySelector("table")?.dispatchEvent(new CustomEvent("directory-list-updated", { bubbles: true }))
        if (listing.truncated) browser.insertAdjacentHTML("beforeend", '<p class="repo-notice">目录过大，未完整展示。</p>')
        const readme = browser.querySelector<HTMLElement>("[data-readme-panel]")
        if (readme) await showReadme(readme, folder).catch(error => { if (!signal.aborted) readme.innerHTML = message(error instanceof Error ? error.message : "README 读取失败") })
      }
      if (!signal.aborted) {
        visibleBrowser.replaceChildren(...browser.childNodes)
        visibleBrowser.querySelector("table")?.dispatchEvent(new CustomEvent("directory-list-updated", { bubbles: true }))
      }
    } else if (route.tab === "commits") {
      const page = Math.max(1, Number(new URL(location.href).searchParams.get("page")) || 1)
      const selectedCommit = new URL(location.href).searchParams.get("commit")
      const result = await read<{ commits: Commit[]; hasMore: boolean; focusedCommit?: Commit }>("commits", { page: String(page), ...(selectedCommit ? {commit:selectedCommit} : {}) })
      if (signal.aborted) return
      const historyCommits = result.focusedCommit ? [result.focusedCommit, ...result.commits] : result.commits
      content.innerHTML = `<form class="repo-compare" data-repo-compare><span>对比版本</span><label><span class="sr-only">基准版本</span><select name="base">${[...info.branches.map(b => `refs/heads/${b}`), ...info.tags.map(t => `refs/tags/${t}`)].map(b => `<option value="${e(b)}">${e(b.replace(/^refs\/(heads|tags)\//, ""))}</option>`).join("")}</select></label><span>→</span><label><span class="sr-only">目标版本</span><select name="head">${[...info.branches.map(b => `refs/heads/${b}`), ...info.tags.map(t => `refs/tags/${t}`)].map(b => `<option value="${e(b)}" ${b === ref ? "selected" : ""}>${e(b.replace(/^refs\/(heads|tags)\//, ""))}</option>`).join("")}</select></label><button class="repo-download" type="submit" aria-label="对比分支或标签" title="对比">${compareIcon}</button></form><div data-repo-diff></div><div class="repo-commits">${historyCommits.map(commit => `<div class="repo-commit-item"><button type="button" class="repo-commit" data-repo-commit="${commit.sha}" aria-expanded="false" aria-controls="repo-diff-${commit.sha}">${repoCommitAvatar(commit.author)}<span class="repo-commit-copy"><strong>${e(commit.subject)}</strong><span>${e(commit.author)} · ${date(commit.date)}</span></span><code>${commit.sha.slice(0, 8)}</code></button><div id="repo-diff-${commit.sha}" data-commit-diff hidden></div></div>`).join("")}</div><nav class="repo-pagination">${page > 1 ? link(repoHref(info.name, { ref: route.ref, tab: "commits", page: String(page - 1) }), "上一页") : ""}${result.hasMore ? link(repoHref(info.name, { ref: route.ref, tab: "commits", page: String(page + 1) }), "下一页") : ""}</nav>`
      const diffHost = content.querySelector<HTMLElement>("[data-repo-diff]")!
      let diffController: AbortController | undefined
      signal.addEventListener("abort", () => diffController?.abort(), { once: true })
      const displayDiff = async (base: string, head: string, target = diffHost) => {
        diffController?.abort(); diffController = new AbortController()
        const diffSignal = AbortSignal.any([signal, diffController.signal]); target.hidden = false; target.innerHTML = loading()
        try {
          const result = await repoRequest<{ diff: string; truncated: boolean }>(repoApi(info.name, "diff", { ref, ...(base ? { base } : {}), head }), diffSignal)
          if (diffSignal.aborted) return
          target.innerHTML = `<section class="repo-panel"><header class="repo-panel-header"><span>${base ? `${e(base)} → ${e(head)}` : `提交 ${e(head.slice(0, 10))}`}</span><button class="repo-icon-action" type="button" data-close-diff aria-label="收起差异" title="收起">${closeIcon}</button></header>${result.diff ? `<pre class="repo-diff">${result.diff.split("\n").map(line => `<span class="${line.startsWith("+") ? "diff-add" : line.startsWith("-") ? "diff-remove" : line.startsWith("@@") || line.startsWith("diff ") ? "diff-heading" : ""}">${e(line) || " "}</span>`).join("")}</pre>` : message("两个版本之间没有文件差异")}${result.truncated ? '<p class="repo-notice">差异过大，仅显示部分内容，请下载源码查看完整变更。</p>' : ""}</section>`
          target.querySelector("[data-close-diff]")?.addEventListener("click", () => {
            target.replaceChildren()
            if (target.hasAttribute("data-commit-diff")) { target.hidden = true; target.parentElement?.querySelector("[data-repo-commit]")?.setAttribute("aria-expanded", "false") }
          }, { signal })
        } catch (error) { if (!diffSignal.aborted) target.innerHTML = message(error instanceof Error ? error.message : "差异读取失败") }
      }
      content.querySelector<HTMLFormElement>("[data-repo-compare]")!.addEventListener("submit", event => {
        event.preventDefault(); const form = new FormData(event.target as HTMLFormElement); void displayDiff(String(form.get("base")), String(form.get("head")))
      }, { signal })
      const toggleCommit = (button: HTMLButtonElement) => {
        const target = button.parentElement!.querySelector<HTMLElement>("[data-commit-diff]")!
        const expanded = button.getAttribute("aria-expanded") === "true"
        diffController?.abort(); diffHost.replaceChildren()
        for (const other of content.querySelectorAll<HTMLElement>("[data-commit-diff]")) {
          other.hidden = true; other.replaceChildren(); other.parentElement?.querySelector("[data-repo-commit]")?.setAttribute("aria-expanded", "false")
        }
        if (!expanded) { button.setAttribute("aria-expanded", "true"); void displayDiff("", button.dataset.repoCommit!, target) }
      }
      content.addEventListener("click", event => {
        const button = (event.target as Element).closest<HTMLButtonElement>("[data-repo-commit]")
        if (button) toggleCommit(button)
      }, { signal })
      const commit = new URL(location.href).searchParams.get("commit")
      const selected = commit ? [...content.querySelectorAll<HTMLButtonElement>("[data-repo-commit]")].find(button => button.dataset.repoCommit === commit) : undefined
      if (selected) toggleCommit(selected)
    } else if (route.tab === "releases") {
      const page = Math.max(1, Number(new URL(location.href).searchParams.get("page")) || 1)
      let result: { releases: Release[]; hasMore: boolean; stale: boolean }
      try { result = await read("releases", { page: String(page) }) }
      catch {
        if (!signal.aborted) content.innerHTML = `${message("暂时无法读取 GitHub 发布版本")}<div class="repo-release-fallback">${external(`${info.githubUrl}/releases`, "在 GitHub 查看发布版本")}</div>`
        return
      }
      if (signal.aborted) return
      const next = document.createElement("div")
      next.innerHTML = `${result.stale ? '<p class="repo-notice">GitHub 暂不可用，正在展示上次获取的版本信息。</p>' : ""}<div class="repo-releases">${result.releases.map((release, i) => `<section class="repo-panel repo-release"><header><div class="repo-release-heading">${icons.tag}<h2>${e(release.name)}</h2>${release.name.trim() !== release.tag.trim() ? `<span class="repo-release-tag">${e(release.tag)}</span>` : ""}${release.prerelease ? `<span class="repo-release-prerelease">预发布</span>` : ""}</div><time datetime="${e(release.publishedAt)}">${date(release.publishedAt)}</time></header>${release.body.trim() ? `<div class="repo-markdown" data-release-body="${i}"></div>` : ""}<div class="repo-assets-heading"><span>下载文件</span><small>${release.assets.length + 1}</small></div><div class="repo-assets">${release.assets.map(asset => `<a href="${e(asset.url)}" target="_blank" rel="noopener noreferrer" data-router-ignore="true" data-no-popover="true">${fileNameIcon(asset.name)}<span>${e(asset.name)}</span><small>${bytes(asset.size)}</small></a>`).join("")}<a href="${e(release.sourceZip)}" target="_blank" rel="noopener noreferrer" data-router-ignore="true" data-no-popover="true">${fileTypeIcons.archive}<span>源代码 (ZIP)</span><small>源码</small></a></div></section>`).join("") || message("该仓库尚未发布 Release")}</div><nav class="repo-pagination">${page > 1 ? link(repoHref(info.name, { tab: "releases", page: String(page - 1) }), "上一页") : ""}${result.hasMore ? link(repoHref(info.name, { tab: "releases", page: String(page + 1) }), "下一页") : ""}</nav>`
      for (let i = 0; i < result.releases.length; i++) {
        const host = next.querySelector<HTMLElement>(`[data-release-body="${i}"]`)
        if (!host) continue
        await markdown(host, result.releases[i].body, "README.md", info, result.releases[i].tag, signal)
        for (const anchor of host.querySelectorAll<HTMLAnchorElement>("a[href]")) {
          const target = new URL(anchor.href)
          if (target.origin === location.origin && repoRoute(target).name === info.name && repoRoute(target).path) {
            anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.dataset.routerIgnore = "true"
          }
        }
      }
      if (!signal.aborted) content.replaceChildren(...next.childNodes)
    } else throw new PageNotFoundError("仓库视图不存在")
  } catch (error) { renderError(error) }
}
