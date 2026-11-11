import { activateDirectoryGroup, activeDirectoryGroup, type DirectoryGroup } from "./directoryGroups"
import { addDirectoryCleanup } from "./directoryPersistence"
import { createDirectoryDetailsMotion } from "./directoryDetailsMotion"
import { revealDirectoryEntry } from "./directoryScroll"
import { repoEscape as e } from "./repoShared"
import {videoHref,videoRoute} from "./videoLibrary"
import {readContentCatalog} from "./contentCatalog"
import {indexedVideoDirectory,seriesDirectoryVideos,type VideoDirectory} from "./indexedNavigation"

const controllerKey = Symbol.for("quartz.video.directory.controllers")
const directoryState = globalThis as unknown as Record<symbol, WeakMap<HTMLDetailsElement, { update: (reset: boolean) => void }>>
const controllers = directoryState[controllerKey] ??= new WeakMap()
const chevron = '<svg class="fold" width="12" height="12" viewBox="5 8 14 8" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>'
export function prepareVideoDirectoryNavigation(anchor: HTMLAnchorElement) {
  anchor.closest("[data-video-nav]")?.dispatchEvent(new CustomEvent("video-directory-link", { detail: { anchor } }))
}
export function setupVideoDirectories(resetHome = false) {
  for (const root of document.querySelectorAll<HTMLDetailsElement>("[data-video-nav]")) {
    const current = controllers.get(root)
    if (current) { current.update(resetHome); continue }
    const lifetime = new AbortController(), setOpen = createDirectoryDetailsMotion(lifetime.signal)
    const list = root.querySelector<HTMLElement>("[data-video-nav-list]")!
    let library: VideoDirectory | undefined, signature = "", pending = false, scroll: AbortController | undefined
    let expanded = new Set<string>()
    try { expanded = new Set(JSON.parse(localStorage.getItem("video-directory-collections") || "[]")) } catch {}
    const branches = () => [...root.querySelectorAll<HTMLDetailsElement>("details[data-video-collection]")]
    const arrows = () => {
      for (const branch of [root, ...branches()]) {
        const open = branch.dataset.directoryExpanded === "true"
        const button = branch.querySelector<HTMLButtonElement>(":scope > summary > button")!
        button.setAttribute("aria-expanded", String(open)); button.setAttribute("aria-label", `${open ? "收起" : "展开"} ${branch.querySelector(":scope > summary > a")?.textContent || "Video"}`)
      }
    }
    const persist = () => { try { localStorage.setItem("video-directory-open", String(root.dataset.directoryExpanded === "true")); localStorage.setItem("video-directory-collections", JSON.stringify([...expanded])) } catch {} }
    const selectGroup = (id: string, animate = false) => {
      expanded.clear()
      for (const branch of branches()) { const open = branch.dataset.videoCollection === id; setOpen(branch, open, animate); if (open) expanded.add(id) }
      persist(); arrows()
    }
    const closeOthers = (group: DirectoryGroup | undefined, animate = false) => {
      if (!group || group.domain === "explore" && group.root === "Video") return
      setOpen(root, false, animate); selectGroup("", animate); scroll?.abort(); persist(); arrows()
    }
    const mark = (reset = false) => {
      if (reset) { setOpen(root, false); selectGroup("") }
      const route = videoRoute(new URL(location.href)), active = /^\/Video(?:\/|$)/.test(location.pathname)
      const group = library?.collections.find(item => item.id === route.collection && (!route.bvid || item.bvids.includes(route.bvid))) || (route.bvid ? library?.collections.find(item => item.bvids.includes(route.bvid)) : undefined)
      for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a")) {
        const target = videoRoute(new URL(anchor.href))
        const selected = active && (route.bvid ? target.bvid === route.bvid && target.collection === (group?.id || "") : !target.bvid && target.collection === route.collection)
        anchor.classList.toggle("active", selected)
        if (selected) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current")
      }
      if (active) {
        setOpen(root, true)
        if (library) selectGroup(group?.id || "")
        scroll?.abort(); scroll = new AbortController()
        void revealDirectoryEntry(root, AbortSignal.any([lifetime.signal, scroll.signal]))
      }
      arrows()
    }
    const render = async () => {
      if (pending) return
      pending = true
      try {
        const data = indexedVideoDirectory(await readContentCatalog({signal:lifetime.signal}))
        if (lifetime.signal.aborted) return
        library = data
        const next = JSON.stringify([data.collections, data.videos.map(video => [video.bvid, video.title, video.publishedAt])])
        if (signature !== next) {
          const leaf = (title: string, href: string) => `<li><a href="${e(href)}" data-no-popover="true" title="${e(title)}">${e(title)}</a></li>`
          list.innerHTML = data.collections.map(group => `<li><details class="drive-branch" data-video-collection="${e(group.id)}"><summary tabindex="-1"><button type="button" class="drive-folder-toggle" aria-label="展开 ${e(group.title)}" aria-expanded="false">${chevron}</button><a href="${e(videoHref("", group.id))}" data-no-popover="true">${e(group.title)}</a></summary><ul>${seriesDirectoryVideos(data, group).map(video => leaf(video.title, videoHref(video.bvid, group.id))).join("")}</ul></details></li>`).join("")
          if (!list.childElementCount) list.innerHTML = '<li class="drive-nav-status">暂无公开视频</li>'
          for (const branch of branches()) setOpen(branch, !resetHome && expanded.has(branch.dataset.videoCollection!))
          signature = next; mark(resetHome)
        }
        list.removeAttribute("aria-busy"); closeOthers(activeDirectoryGroup()); resetHome = false
      } catch { if (!library && !lifetime.signal.aborted) list.innerHTML = '<li class="drive-nav-status"><button type="button" data-video-retry>读取失败，点击重试</button></li>' }
      finally { pending = false }
    }
    const update = (reset: boolean) => { resetHome = reset; mark(reset); closeOthers(activeDirectoryGroup()); void render() }
    controllers.set(root, { update }); addDirectoryCleanup(root, () => { lifetime.abort(); scroll?.abort(); controllers.delete(root) })
    root.parentElement!.classList.add("is-loaded"); requestAnimationFrame(() => { if (root.isConnected) root.parentElement!.dataset.motionReady = "" })
    try { setOpen(root, !resetHome && localStorage.getItem("video-directory-open") === "true") } catch {}
    root.addEventListener("click", event => {
      const target = event.target as Element
      if (target.closest("[data-video-retry]")) { void render(); return }
      const anchor = target.closest<HTMLAnchorElement>("a")
      if (anchor) { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) prepareVideoDirectoryNavigation(anchor); return }
      const summary = target.closest("summary")
      if (!summary) return
      event.preventDefault(); event.stopPropagation()
      const branch = summary.parentElement as HTMLDetailsElement, open = branch.dataset.directoryExpanded === "true"
      if (!open) { activateDirectoryGroup({ domain: "explore", root: "Video" }); if (branch !== root) for (const sibling of branches()) if (sibling !== branch) setOpen(sibling, false, false) }
      setOpen(branch, !open, true)
      expanded = new Set(branches().filter(item => item.dataset.directoryExpanded === "true").map(item => item.dataset.videoCollection!)); persist(); arrows()
    }, { signal: lifetime.signal })
    root.addEventListener("video-directory-link", event => {
      const anchor = (event as CustomEvent<{ anchor: HTMLAnchorElement }>).detail.anchor
      activateDirectoryGroup({ domain: "explore", root: "Video" }); setOpen(root, true)
      const route = videoRoute(new URL(anchor.href)); selectGroup(route.collection, false); persist()
    }, { signal: lifetime.signal })
    document.addEventListener("directory-group-change", event => closeOthers((event as CustomEvent<DirectoryGroup | undefined>).detail, false), { signal: lifetime.signal })
    update(resetHome)
  }
}
