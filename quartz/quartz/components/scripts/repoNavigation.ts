import {readContentCatalog,peekContentCatalog} from "./contentCatalog"
import {indexedRepoDirectory,type RepoDirectory} from "./indexedNavigation"
import { repoEscape as e, repoHref, repoLanguages, repoRoute } from "./repoShared"
import { addDirectoryCleanup, consumeRouteDirectoryToggle } from "./directoryPersistence"
import { activateDirectoryGroup, activeDirectoryGroup, type DirectoryGroup } from "./directoryGroups"
import { revealDirectoryEntry } from "./directoryScroll"
import { createDirectoryDetailsMotion } from "./directoryDetailsMotion"

const controllerKey = Symbol.for("quartz.repo.directory.controllers")
const directoryState = globalThis as unknown as Record<symbol, WeakMap<HTMLDetailsElement, { update: (reset: boolean) => void }>>
const controllers = directoryState[controllerKey] ??= new WeakMap()
const chevron = '<svg class="fold" width="12" height="12" viewBox="5 8 14 8" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>'
export function prepareRepoDirectoryNavigation(anchor: HTMLAnchorElement) {
  anchor.closest("[data-repo-nav]")?.dispatchEvent(new CustomEvent("repo-directory-link", { detail: { anchor } }))
}
export function setupRepoDirectories(resetHome = false) {
  for (const root of document.querySelectorAll<HTMLDetailsElement>("[data-repo-nav]")) {
    const existing = controllers.get(root)
    if (existing) { existing.update(resetHome); continue }
    const lifetime = new AbortController(), setOpen = createDirectoryDetailsMotion(lifetime.signal)
    const list = root.querySelector<HTMLElement>("[data-repo-nav-list]")!
    let snapshot: RepoDirectory | undefined, signature = "", pending = false
    let routeScroll: AbortController | undefined
    let expanded = new Set<string>()
    try { expanded = new Set(JSON.parse(localStorage.getItem("repo-directory-languages") || "[]")) } catch { /* Storage is optional. */ }
    const branches = () => [...root.querySelectorAll<HTMLDetailsElement>("details[data-repo-language]")]
    const updateArrows = () => {
      for (const details of [root, ...branches()]) {
        const open = details.dataset.directoryExpanded ? details.dataset.directoryExpanded === "true" : details.open
        const button = details.querySelector<HTMLButtonElement>(":scope > summary > button")!
        button.setAttribute("aria-expanded", String(open))
        button.setAttribute("aria-label", `${open ? "收起" : "展开"} ${details.querySelector(":scope > summary > a")?.textContent || "Repo"}`)
      }
    }
    const persist = () => {
      try {
        localStorage.setItem("repo-directory-open", String(root.dataset.directoryExpanded === "true"))
        localStorage.setItem("repo-directory-languages", JSON.stringify([...expanded]))
      } catch { /* Storage is optional. */ }
    }
    const closeOtherGroups = (group: DirectoryGroup | undefined, animate = false) => {
      if (!group || group.root === "Repo" && group.domain === "explore") return
      setOpen(root, false, animate)
      for (const child of branches()) setOpen(child, false, animate)
      expanded.clear(); routeScroll?.abort(); persist(); updateArrows()
    }
    const mark = (reset = false) => {
      const route = repoRoute(new URL(location.href)), active = /^\/Repo(?:\/|$)/.test(location.pathname)
      if (reset) { setOpen(root, false); branches().forEach(group => setOpen(group, false)); expanded.clear(); persist() }
      for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a")) {
        const target = repoRoute(new URL(anchor.href)), selected = active && target.name === route.name && Boolean(route.name || target.language === route.language)
        anchor.classList.toggle("active", selected)
        if (selected) anchor.setAttribute("aria-current", "page"); else anchor.removeAttribute("aria-current")
      }
      if (active) {
        setOpen(root, true)
        const selected = (snapshot || (peekContentCatalog() ? indexedRepoDirectory(peekContentCatalog()!) : undefined))?.repositories.find(r => r.name.toLowerCase() === route.name.toLowerCase())
        const language = route.name ? selected ? selected.language || "其他" : undefined : route.language
        if (language !== undefined) {
          expanded.clear()
          for (const group of branches()) {
            const open = group.dataset.repoLanguage === language
            setOpen(group, open)
            if (open) expanded.add(language)
          }
          persist()
        }
        routeScroll?.abort(); routeScroll = new AbortController()
        void revealDirectoryEntry(root, AbortSignal.any([lifetime.signal, routeScroll.signal]))
      }
      updateArrows()
    }
    const render = async () => {
      if (pending) return
      pending = true
      try {
        const data = indexedRepoDirectory(await readContentCatalog({signal:lifetime.signal}))
        if (lifetime.signal.aborted) return
        snapshot = data
        const next = JSON.stringify(data.repositories.map(r => [r.name, r.language]))
        const changed = next !== signature
        if (changed) {
          for (const group of branches()) if (group.open) expanded.add(group.dataset.repoLanguage!)
          list.innerHTML = repoLanguages(data.repositories).map(language => `<li><details class="drive-branch" data-repo-language="${e(language)}"><summary tabindex="-1"><button type="button" class="drive-folder-toggle" data-repo-toggle aria-label="展开 ${e(language)}" aria-expanded="false">${chevron}</button><a href="${e(repoHref("", { language }))}" data-no-popover="true">${e(language)}</a></summary><ul>${data.repositories.filter(r => (r.language || "其他") === language).map(r => `<li><a href="${e(repoHref(r.name))}" data-no-popover="true" title="${e(r.name)}">${e(r.name)}</a></li>`).join("")}</ul></details></li>`).join("") || '<li class="drive-nav-status">暂无公开仓库</li>'
          for (const group of branches()) setOpen(group, !resetHome && expanded.has(group.dataset.repoLanguage!))
          signature = next
        }
        list.removeAttribute("aria-busy"); if (changed) mark(resetHome); closeOtherGroups(activeDirectoryGroup()); resetHome = false
      } catch {
        if (!lifetime.signal.aborted && !snapshot) list.innerHTML = '<li class="drive-nav-status"><button type="button" data-repo-retry>仓库读取失败，点击重试</button></li>'
      } finally { pending = false }
    }
    const update = (reset: boolean) => { resetHome = reset; mark(reset); closeOtherGroups(activeDirectoryGroup()); void render() }
    controllers.set(root, { update })
    addDirectoryCleanup(root, () => { lifetime.abort(); routeScroll?.abort(); controllers.delete(root) })
    root.parentElement!.classList.add("is-loaded")
    requestAnimationFrame(() => { if (root.isConnected) root.parentElement!.dataset.motionReady = "" })
    root.querySelector("summary")!.tabIndex = -1
    try { setOpen(root, !resetHome && localStorage.getItem("repo-directory-open") === "true") } catch { /* Keep initial state. */ }
    root.addEventListener("click", event => {
      const target = event.target as Element
      if (target.closest("[data-repo-retry]")) { void render(); return }
      const anchor = target.closest<HTMLAnchorElement>("a")
      if (anchor) {
        if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) prepareRepoDirectoryNavigation(anchor)
        return
      }
      const summary = target.closest("summary")
      if (!summary) return
      event.preventDefault(); event.stopPropagation()
      const details = summary.parentElement as HTMLDetailsElement
      const open = details.dataset.directoryExpanded ? details.dataset.directoryExpanded === "true" : details.open
      if (!open) {
        activateDirectoryGroup({ domain: "explore", root: "Repo" })
        if (details !== root) for (const sibling of branches()) if (sibling !== details) setOpen(sibling, false, false)
      }
      setOpen(details, !open, true); updateArrows()
      try {
        if (details === root) localStorage.setItem("repo-directory-open", String(!open))
        else {
          expanded = new Set(branches().filter(group => group.dataset.directoryExpanded === "true").map(group => group.dataset.repoLanguage!))
          localStorage.setItem("repo-directory-languages", JSON.stringify([...expanded]))
        }
      } catch { /* Storage is optional. */ }
    }, { signal: lifetime.signal })
    root.addEventListener("toggle", event => { consumeRouteDirectoryToggle(event.target as HTMLDetailsElement); updateArrows() }, { signal: lifetime.signal, capture: true })
    root.addEventListener("repo-directory-link", event => {
      const anchor = (event as CustomEvent<{ anchor: HTMLAnchorElement }>).detail.anchor
      const target = repoRoute(new URL(anchor.href))
      activateDirectoryGroup({ domain: "explore", root: "Repo" })
      setOpen(root, true)
      const selected = (snapshot || (peekContentCatalog() ? indexedRepoDirectory(peekContentCatalog()!) : undefined))?.repositories.find(repo => repo.name.toLowerCase() === target.name.toLowerCase())
      const language = target.name ? selected ? selected.language || "其他" : anchor.closest<HTMLDetailsElement>("[data-repo-language]")?.dataset.repoLanguage : target.language
      expanded.clear()
      for (const child of branches()) {
        const open = child.dataset.repoLanguage === language
        setOpen(child, open, false)
        if (open && language) expanded.add(language)
      }
      persist(); updateArrows()
    }, { signal: lifetime.signal })
    document.addEventListener("directory-group-change", event => closeOtherGroups((event as CustomEvent<DirectoryGroup | undefined>).detail, false), { signal: lifetime.signal })
    update(resetHome)
  }
}
