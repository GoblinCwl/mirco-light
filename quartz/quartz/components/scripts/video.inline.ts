import {PageNotFoundError,showSiteNotFound} from "./siteError"
import {readContentCatalog,peekContentCatalog} from './contentCatalog'
import { sidebarModule } from "./sidebarModule"
import { videoProfile } from "./videoProfile"
import { setPageModified, latestPageDate } from "./pageModified"
import { setPageHeadingTags } from "./pageHeadingTags"
import { videoTagsByBvid } from "./videoGraph"
import { videoMediaListing, setupVideoMediaImages, videoCatalogHref, type VideoCatalogSort } from "./videoMedia"
import { normalizeMediaOverview, renderMediaOverview } from "./mediaOverview"
import { homeIcons } from "../../home/icons"
import { repoEscape as e } from "./repoShared"
import { createRepoViewNavigation } from "./repoViewNavigation"
import { activateDirectoryGroup } from "./directoryGroups"
import { setupVideoDirectories, prepareVideoDirectoryNavigation } from "./videoNavigation"
import { collectionVideos, readVideoLibrary, resolveVideoPage, videoHref, videoIcon, videoPlayerUrl, videoRoute, type VideoCollection, type VideoDetail, type VideoStats, type VideoItem, type VideoLibrary } from "./videoLibrary"

const date = (value: string | null) => value ? new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—"
const duration = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`
const empty = (text: string) => `<div class="video-empty">${videoIcon}<p>${e(text)}</p></div>`
let active: { url: URL; root: HTMLElement; navigate: (url: URL, push?: boolean, force?: boolean) => void } | undefined

document.addEventListener("click", event => {
  if (!active?.root.isConnected || !(event.target instanceof Element) || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const anchor = event.target.closest<HTMLAnchorElement>("a[href]")
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.hasAttribute("data-router-ignore")) return
  const target = new URL(anchor.href)
  if (target.origin !== location.origin || !/^\/Video(?:\/|$)/.test(target.pathname)) return
  event.preventDefault(); event.stopImmediatePropagation(); prepareVideoDirectoryNavigation(anchor)
  if (anchor.closest(".explorer-content") && matchMedia("(max-width: 800px)").matches) {
    const explorer = anchor.closest<HTMLElement>(".explorer")!
    explorer.classList.add("collapsed"); explorer.setAttribute("aria-expanded", "false")
    explorer.querySelector(".mobile-explorer")?.setAttribute("aria-expanded", "false")
    document.documentElement.classList.remove("mobile-no-scroll")
  }
  if(anchor.hasAttribute("data-catalog-page-link"))active.root.dataset.videoScrollTarget=target.href
  else delete active.root.dataset.videoScrollTarget
  active.navigate(target)
}, { capture: true })
window.addEventListener("popstate", event => {
  if (!active?.root.isConnected || !/^\/Video(?:\/|$)/.test(location.pathname)) return
  delete active.root.dataset.videoScrollTarget
  event.stopImmediatePropagation(); active.navigate(new URL(location.href), false)
}, { capture: true })

function heading(group?: VideoCollection, video?: VideoItem, modified?: string | null, tags: readonly string[] = []) {
  const name = video?.title || `星域: Video${group ? "/" + group.title : ""}`
  const center = document.querySelector(".center")!
  setPageModified(center, video ? video.publishedAt : modified)
  setPageHeadingTags(center,video?peekContentCatalog()?.pages[`Video/${video.bvid}`]?.tags||tags:tags)
  const copy = center.querySelector<HTMLElement>(".article-title-copy")!
  const text = [...copy.childNodes].find(node => node.nodeType === Node.TEXT_NODE)
  if (text) text.textContent = name
  copy.setAttribute("aria-label", `复制文章链接：${name}`)
  center.querySelector<HTMLElement>(".article-title")!.style.visibility = "visible"
  document.title = `${name} · 微光集`
  const crumbs = [{ name: "Home", href: "/" }, { name: "Video", href: "/Video/" }]
  if (group) crumbs.push({ name: group.title, href: videoHref("", group.id) })
  if (video) crumbs.push({ name: video.title, href: videoHref(video.bvid, group?.id) })
  const trail = center.querySelector<HTMLElement>(".breadcrumb-container")!
  const html = crumbs.map((crumb, index) => `<div class="breadcrumb-element"><a href="${e(crumb.href)}" data-no-popover="true" ${index === crumbs.length - 1 ? 'aria-current="page"' : ""}>${e(crumb.name)}</a>${index < crumbs.length - 1 ? "<p> ❯ </p>" : ""}</div>`).join("")
  if (trail.dataset.videoTrail !== html) { trail.innerHTML = html; trail.dataset.videoTrail = html }
}

const observedParts = new Map<string, VideoDetail["pages"]>()
const observedStats = new Map<string, VideoStats>()
function playbackDetail(video: VideoItem) {
  if (video.availability === "unavailable") return '<span>已失效</span>'
  return ""
}
function updatePlaybackDetail(root: HTMLElement, video: VideoItem) {
  const host = root.querySelector<HTMLElement>("[data-video-playback-detail]")!
  const html = playbackDetail(video)
  host.innerHTML = html
  host.hidden = !html
}
function unavailablePlayer(video: VideoItem, group?: VideoCollection, reason?: string) {
  return `<div class="video-unavailable" role="status"><span class="video-unavailable-symbol"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="15" width="46" height="34" rx="5"/><path d="M19 15v34m26-34v34M9 25h10M9 39h10m26-14h10m-10 14h10M32 24l-5 8 9 1-5 8M7 7l4 4m42 42 4 4"/></svg></span><span class="video-unavailable-label">已失效</span><h2>这个视频暂时无法观看</h2><p>${e(reason || video.unavailableReason || "视频已失效或不在本站视频库中。")}</p><div class="video-unavailable-actions"><a href="${e(videoHref("", group?.id))}" data-no-popover="true">${group ? "返回系列" : "返回 Video"}</a><a href="${e(video.url)}" target="_blank" rel="noopener noreferrer" data-router-ignore="true">${homeIcons.bilibili}<span>前往哔哩哔哩</span></a></div></div>`
}
const statisticIcons: Record<keyof VideoStats, string> = {
  play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
  danmaku: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9h4m3 0h3M7 13h3m3 0h4"/>',
  like: '<path d="M8 10 12 3c2 0 3 1 2 4l-1 3h5a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H8ZM3 10h5v11H3Z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 8h6m-6 8h6m-3-8v8m-3-4h6"/>',
  favorite: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  share: '<path d="m14 3 7 7-7 7v-4c-6 0-9 2-11 6 0-8 4-12 11-12Z"/>',
}
function videoStats(video: VideoItem) {
  const stats = observedStats.get(video.bvid)
  const value = (key: keyof VideoStats) => {
    const count = stats ? stats[key] : video.availability === "unavailable" ? null : key === "play" ? video.play : key === "danmaku" ? video.danmaku : null
    return count == null ? "—" : count.toLocaleString("zh-CN")
  }
  return ([["play", "播放"], ["danmaku", "弹幕"], ["like", "点赞"], ["coin", "投币"], ["favorite", "收藏"], ["share", "分享"]] as const).map(([key, label]) => `<div title="${label}：${value(key)}"><dt><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${label}">${statisticIcons[key]}</svg></dt><dd>${value(key)}</dd></div>`).join("")
}
function sidebar(library: VideoLibrary, video: VideoItem, group?: VideoCollection) {
  const related = group ? collectionVideos(library, group) : []
  return sidebarModule("当前视频", `<div class="video-sidebar-target"><span class="video-current-icon" aria-hidden="true">${homeIcons.bilibili}</span><a href="${e(video.url)}" title="${e(video.title)} · 在哔哩哔哩打开" target="_blank" rel="noopener noreferrer" data-router-ignore="true">${e(video.title)}</a></div><p class="video-current-summary">${e(video.bvid)}</p>`, "video-sidebar-group video-current-context", "video-current-heading") + `<div data-video-parts-slot></div>` + (related.length ? sidebarModule("相关视频", `<div class="video-related-series">${e(group!.title)}</div><nav class="video-related" aria-label="相关视频">${related.map(item => `<a href="${e(videoHref(item.bvid, group!.id))}" data-no-popover="true" class="${item.bvid === video.bvid ? "active" : ""}" ${item.bvid === video.bvid ? 'aria-current="page"' : ""} title="${e(item.title)}"><span class="video-related-artwork">${item.cover ? `<img src="${e(item.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" no-view />` : videoIcon}</span><span class="video-related-copy"><strong>${e(item.title)}</strong><small>${e(date(item.publishedAt))} · ${duration(item.duration)}</small></span></a>`).join("")}</nav>`, "video-sidebar-group", "video-sidebar-group-heading") : "")
}

document.addEventListener("nav", () => {
  const root = document.querySelector<HTMLElement>("[data-video-page]")
  if (!root) return
  const frame = root.closest<HTMLElement>(".video-frame")!
  const position = () => { const box = root.getBoundingClientRect(); frame.style.setProperty("--video-loader-x", `${(Math.max(0, box.left) + Math.min(innerWidth, box.right)) / 2}px`) }
  position(); const sizes = new ResizeObserver(position); sizes.observe(root)
  let detailRequest: AbortController | undefined
  let playerLoad: AbortController | undefined
  const pageEvents = new AbortController()
  root.addEventListener("change", event => {
    const select = (event.target as Element).closest<HTMLSelectElement>("[data-video-media-sort]")
    if (!select) return
    const route=videoRoute(new URL(location.href))
    if(!route.bvid)active?.navigate(new URL(videoCatalogHref(route.collection,select.value as VideoCatalogSort),location.origin))
  }, { signal: pageEvents.signal })
  const panelHost = document.querySelector<HTMLElement>(".video-sidebar-panel")!
  const partsPanel = panelHost.querySelector<HTMLElement>("[data-video-parts-panel]")!
  const partsList = partsPanel.querySelector<HTMLElement>("[data-video-part-list]")!
  const compact = matchMedia("(max-width: 1199px)")
  const sidebarContent = panelHost.querySelector<HTMLElement>(".video-sidebar-content")!
  const graph = sidebarContent.querySelector<HTMLElement>("[data-video-graph]")!
  const hideVideoGraph = () => {
    const visible = !graph.hidden
    graph.hidden = true; delete graph.dataset.videoNode
    if (visible) document.dispatchEvent(new CustomEvent("video-graph-ready"))
  }
  let sidebarFrame = 0
  const layoutSidebar = () => {
    cancelAnimationFrame(sidebarFrame)
    sidebarFrame = requestAnimationFrame(() => {
      if (pageEvents.signal.aborted || compact.matches) return
      const sidebar = sidebarContent.querySelector<HTMLElement>("[data-video-sidebar]")!
      const related = sidebar.querySelector<HTMLElement>(".video-related")
      const hasParts = !partsPanel.hidden && sidebar.contains(partsPanel)
      const bottom = parseFloat(getComputedStyle(panelHost.closest<HTMLElement>(".sidebar")!).paddingBottom) || 16
      const available = Math.max(0, Math.floor(innerHeight - sidebarContent.getBoundingClientRect().top - bottom))
      sidebarContent.style.maxHeight = `${available}px`
      const padding = parseFloat(getComputedStyle(sidebarContent).paddingBottom) || 0
      const fixed = sidebar.getBoundingClientRect().height + (graph.hidden ? 0 : graph.getBoundingClientRect().height) - (hasParts ? partsList.getBoundingClientRect().height : 0) - (related?.getBoundingClientRect().height || 0)
      const budget = Math.max(0, available - padding - Math.ceil(fixed) - 2)
      const desiredParts = hasParts ? Math.min(partsList.scrollHeight, innerHeight * .32, 384) : 0
      const desiredRelated = related ? Math.min(related.scrollHeight, innerHeight * .28, 352) : 0
      const scale = Math.min(1, budget / (desiredParts + desiredRelated || 1))
      const setHeight = (element: HTMLElement | null, value: number) => {
        if (!element) return
        const height = `${Math.floor(value * scale)}px`
        if (element.style.maxHeight !== height) element.style.maxHeight = height
      }
      if (hasParts) setHeight(partsList, desiredParts)
      setHeight(related, desiredRelated)
    })
  }
  const sidebarSizes = new ResizeObserver(layoutSidebar)
  sidebarSizes.observe(sidebarContent); sidebarSizes.observe(partsPanel); sidebarSizes.observe(graph)
  sidebarSizes.observe(sidebarContent.querySelector<HTMLElement>("[data-video-sidebar]")!)
  addEventListener("resize", layoutSidebar, { signal: pageEvents.signal })
  addEventListener("scroll", layoutSidebar, { passive: true, signal: pageEvents.signal })
  const revealPart = () => requestAnimationFrame(() => {
    const selected = partsList.querySelector<HTMLElement>('[aria-current="page"]')
    if (selected) partsList.scrollTop += selected.getBoundingClientRect().top - partsList.getBoundingClientRect().top - partsList.clientHeight / 2 + selected.clientHeight / 2
  })
  const placeParts = () => {
    const parent = compact.matches ? root.querySelector<HTMLElement>("[data-video-inline-parts]") || panelHost : panelHost.querySelector<HTMLElement>("[data-video-parts-slot]") || panelHost
    if (partsPanel.parentElement !== parent) parent.append(partsPanel)
  }
  const adaptParts = () => {
    placeParts()
    if (compact.matches) { partsList.style.removeProperty("max-height"); sidebarContent.style.removeProperty("max-height") }
    layoutSidebar()
  }
  adaptParts(); compact.addEventListener("change", adaptParts, { signal: pageEvents.signal })
  const renderParts = (bvid = "", collection = "") => {
    const pages = observedParts.get(bvid) || []
    partsPanel.hidden = pages.length < 2
    if (partsPanel.hidden) { layoutSidebar(); return }
    const key = JSON.stringify([bvid, collection, pages])
    if (partsList.dataset.partsKey !== key) {
      partsList.innerHTML = pages.map(part => `<a href="${e(videoHref(bvid, collection, part.page))}" data-no-popover="true" title="P${part.page} · ${e(part.title)}"><span class="video-part-number">P${part.page}</span><span class="video-part-title">${e(part.title || `第 ${part.page} 部分`)}</span><small>${duration(part.duration)}</small></a>`).join("")
      partsList.dataset.partsKey = key
    }
    const current = videoRoute(new URL(location.href)).page
    for (const anchor of partsList.querySelectorAll<HTMLAnchorElement>("a")) {
      if (videoRoute(new URL(anchor.href)).page === current) anchor.setAttribute("aria-current", "page")
      else anchor.removeAttribute("aria-current")
    }
    placeParts(); layoutSidebar(); revealPart()
  }
  const navigation = createRepoViewNavigation(new URL(location.href), {
    push: url => { if (url.href !== location.href) history.pushState({}, "", url) },
    anchor: () => {},
    ready: url => {
      if(root.dataset.videoScrollTarget!==url.href)return
      delete root.dataset.videoScrollTarget
      requestAnimationFrame(()=>{if(root.isConnected&&location.href===url.href&&!pageEvents.signal.aborted)root.querySelector<HTMLElement>('[data-video-all]')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})})
    },
    updateDirectory: () => { activateDirectoryGroup({ domain: "explore", root: "Video" }); setupVideoDirectories() },
    busy: pending => {
      root.setAttribute("aria-busy", String(pending))
      if (!pending) frame.querySelector("[data-video-loading]")?.remove()
    },
    render: async (_url, signal) => {
      try {
        const [library]=await Promise.all([readVideoLibrary(),readContentCatalog().catch(()=>undefined)])
        if (signal.aborted) return
        const {route,video,group}=resolveVideoPage(library,new URL(location.href))
        const aside=document.querySelector<HTMLElement>("[data-video-sidebar]")!
        heading(group, video, latestPageDate((group ? collectionVideos(library, group) : library.videos).map(item => item.publishedAt)), video ? [...videoTagsByBvid(library).get(video.bvid) || []] : [])
        if (!video) {
          detailRequest?.abort()
          playerLoad?.abort()
          const sort=new URL(location.href).searchParams.get("sort")
          const order:VideoCatalogSort=sort==="oldest"||sort==="name"?sort:"newest"
          root.innerHTML = videoMediaListing(library, group, order, Number(new URL(location.href).searchParams.get("page")))
          root.dataset.mediaCollection = group?.id || ""
          setupVideoMediaImages(root, signal)
          partsPanel.remove(); panelHost.append(partsPanel); renderParts()
          const profileKey=JSON.stringify(["profile",library.mid,library.profile,library.activities])
          if(aside.dataset.videoId!==profileKey){aside.innerHTML=videoProfile(library);aside.dataset.videoId=profileKey}
          delete root.dataset.playerKey
          hideVideoGraph()
          return
        }
        graph.hidden = false
        if (graph.dataset.videoNode !== video.bvid) {
          graph.dataset.videoNode = video.bvid
          document.dispatchEvent(new CustomEvent("video-graph-ready"))
        }
        const playerKey = `${video.bvid}:${route.page}`
        root.dataset.collection = group?.id || ""
        if (root.dataset.playerKey !== playerKey) {
          detailRequest?.abort()
          playerLoad?.abort()
          const playback = playbackDetail(video)
          root.innerHTML = `<p class="video-playback-detail" data-video-playback-detail${playback ? "" : " hidden"}>${playback}</p><div class="video-player-stage is-loading" aria-busy="true"><span class="video-player-loading" role="status" aria-label="正在加载播放器"><span class="drive-loading" aria-hidden="true"><i /></span></span><iframe title="${e(video.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><section class="video-engagement" aria-label="视频统计"><dl class="video-statistics" data-video-statistics>${videoStats(video)}</dl></section><section class="video-description" data-video-description></section><div data-video-inline-parts></div>`
          root.dataset.playerKey = playerKey
          playerLoad = new AbortController()
          const stage = root.querySelector<HTMLElement>(".video-player-stage")!
          const startPlayer = () => {
            if (stage.querySelector("iframe")?.hasAttribute("src")) return
            stage.innerHTML = `<span class="video-player-loading" role="status" aria-label="正在加载播放器"><span class="drive-loading" aria-hidden="true"><i /></span></span><iframe title="${e(video.title)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
            stage.classList.remove("is-unavailable"); stage.classList.add("is-loading"); stage.setAttribute("aria-busy", "true")
            const player = stage.querySelector<HTMLIFrameElement>("iframe")!
            player.addEventListener("load", () => {
              if (!stage.isConnected || root.dataset.playerKey !== playerKey) return
              stage.classList.remove("is-loading"); stage.setAttribute("aria-busy", "false")
              stage.querySelector(".video-player-loading")?.remove()
            }, { once: true, signal: playerLoad!.signal })
            player.src = videoPlayerUrl(video.bvid, route.page)
          }
          const showUnavailable = (reason?: string) => {
            stage.classList.remove("is-loading"); stage.classList.add("is-unavailable"); stage.setAttribute("aria-busy", "false")
            stage.innerHTML = unavailablePlayer(video, group, reason)
            updatePlaybackDetail(root, { ...video, availability: "unavailable" })
            observedParts.set(video.bvid, []); renderParts()
          }
          if (video.availability === "unavailable") showUnavailable()
          else startPlayer()
          const overview = root.querySelector<HTMLElement>("[data-video-description]")!
          const overviewSignal = playerLoad.signal
          let renderedOverview = ""
          const updateDescription = (value: string) => {
            const normalized = normalizeMediaOverview(value)
            const content = normalized && normalized !== "-" ? normalized : "暂无简介"
            if (content === renderedOverview) return
            renderedOverview = content
            renderMediaOverview(overview, content, { title: "视频简介", signal: overviewSignal })
          }
          updateDescription(video.description)
          detailRequest = new AbortController()
          const detailSignal = detailRequest.signal
          void fetch(`/api/video/detail?bvid=${encodeURIComponent(video.bvid)}`, { signal: detailSignal, credentials: "omit" }).then(async response => {
            if (!response.ok) return
            const detail = await response.json() as VideoDetail
            if (detailSignal.aborted || root.dataset.playerKey !== playerKey) return
            observedParts.set(video.bvid, detail.pages)
            updatePlaybackDetail(root, video)
            if (detail.availability === "unavailable") { showUnavailable(detail.unavailableReason); return }
            startPlayer()
            updateDescription(detail.description || video.description)
            if (detail.stats) {
              observedStats.set(video.bvid, detail.stats)
              const statistics = document.querySelector<HTMLElement>("[data-video-statistics]")
              if (statistics) statistics.innerHTML = videoStats(video)
            }
            observedParts.set(video.bvid, detail.pages)
            renderParts(video.bvid, root.dataset.collection)
          }).catch(() => { /* Cached metadata and the official player remain usable. */ })
        }
        const sidebarKey = `${video.bvid}:${group?.id || ""}`
        if (aside.dataset.videoId !== sidebarKey) {
          partsPanel.remove()
          aside.innerHTML = sidebar(library, video, group); aside.dataset.videoId = sidebarKey
          const selected = aside.querySelector<HTMLElement>('[aria-current="page"]'), scroll = aside.querySelector<HTMLElement>(".video-related")
          if (selected && scroll) requestAnimationFrame(() => { scroll.scrollTop = selected.offsetTop - scroll.offsetTop - scroll.clientHeight / 2 + selected.clientHeight / 2 })
        }
        if (video.parts && !observedParts.has(video.bvid)) observedParts.set(video.bvid, video.parts)
        renderParts(video.bvid, group?.id)
      } catch (error) {
        if (signal.aborted) return
        if(error instanceof PageNotFoundError){showSiteNotFound();return}
        detailRequest?.abort()
        playerLoad?.abort()
        delete root.dataset.playerKey
        partsPanel.remove(); panelHost.append(partsPanel); renderParts()
        document.querySelector<HTMLElement>("[data-video-sidebar]")?.replaceChildren()
        const aside = document.querySelector<HTMLElement>("[data-video-sidebar]")
        if (aside) delete aside.dataset.videoId
        hideVideoGraph()
        heading()
        root.innerHTML = empty(error instanceof Error ? error.message : "视频读取失败")
        document.querySelector<HTMLElement>(".center .article-title")!.style.visibility = "visible"
      }
    },
  })
  const controller = { root, get url() { return navigation.url }, navigate: (url: URL, push = true, force = false) => { navigation.navigate(url, push, force) } }
  active = controller
  window.addCleanup(() => { navigation.dispose(); detailRequest?.abort(); playerLoad?.abort(); cancelAnimationFrame(sidebarFrame); sidebarSizes.disconnect(); pageEvents.abort(); sizes.disconnect(); if (active === controller) active = undefined })
  navigation.navigate(new URL(location.href), false)
})
