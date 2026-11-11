import {readGuestFiles} from './shareGuestFiles'
import { fetchDriveAliases } from "./driveAliases"
import { activateDirectoryGroup, activeDirectoryGroup, driveDirectoryRoot, type DirectoryGroup } from "./directoryGroups"
import { revealDirectoryEntry } from "./directoryScroll"
import { addDirectoryCleanup, consumeRouteDirectoryToggle, setRouteDirectoryOpen } from "./directoryPersistence"
import { clearDriveDirectoryCache, DIRECTORY_CACHE_TTL, readDriveDirectory } from "./driveDirectoryCache"
import { encryptedIcon } from "../../util/encryptedIcon"
import { readDriveShareCode } from "./driveCredentials"
import { driveShareProtected, fetchDriveEntries } from "./driveEntries"
import { DriveError, driveHref, driveRoute, driveToken, drivePassword, driveRequest, forgetDriveShareCode, requireDriveUser, setDriveToken } from "./driveClient"
import { DriveFile, joinDrivePath, sortDriveFiles } from "./openlistShared"
import { fetchDriveMedia, isMediaSidecar, movieTreeKey, movieTreeTargets, type MediaListing } from "./driveMediaView"

const expanded = new Set<string>()
let treeToken = ""
let controller: { roots: HTMLDetailsElement[]; update: (resetHome?: boolean) => void; dispose: () => void } | undefined
const chevron = '<svg class="fold" width="12" height="12" viewBox="5 8 14 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>'

// Patch by entry identity: unchanged folders retain their nodes, listeners and children.
function reconcile(list: HTMLUListElement, items: HTMLLIElement[]) {
  const keep = new Set(items)
  for (const child of [...list.children]) if (!keep.has(child as HTMLLIElement)) child.remove()
  items.forEach((item, index) => { if (list.children[index] !== item) list.insertBefore(item, list.children[index] || null) })
}

export function setupDriveDirectories(resetHome = false) {
  const roots = [...document.querySelectorAll<HTMLDetailsElement>(".drive-nav")]
  if (controller && roots.length === controller.roots.length && roots.every((root, index) => root === controller!.roots[index])) {
    controller.update(resetHome); return
  }
  controller?.dispose()
  if (!roots.length) { controller = undefined; return }
  if (resetHome) expanded.clear()
  const cleanup = new AbortController()
  let navigation = new AbortController(), current = new URL(location.href), route = driveRoute(current)
  let active = document.body.dataset.slug === "Share/index", currentPath = route.path
  let positioned = new WeakSet<HTMLDetailsElement>()
  const loaders = new WeakMap<HTMLDetailsElement, () => Promise<void>>()
  const loadedPages = new WeakMap<HTMLUListElement, number>()
  const signatures = new WeakMap<HTMLUListElement, string>()
  const shareKey = (id: string, path: string) => `share:${JSON.stringify([id, path])}`
  const onPath = (key: string) => active && activeDirectoryGroup()?.domain === "drive" && ((route.view === "share" && key.startsWith("share:") && (() => {
    const [id, path] = JSON.parse(key.slice(6)) as [string, string]
    return id === route.share && (path === "/" || currentPath === path || currentPath.startsWith(`${path}/`))
  })()) ||
    (route.view === "guest" && key.startsWith("guest:") && (currentPath === key.slice(6) || currentPath.startsWith(`${key.slice(6)}/`))) ||
    (route.view === "storage" && (key === "storage" || key.startsWith("folder:") && (currentPath === key.slice(7) || currentPath.startsWith(`${key.slice(7)}/`)))))
  const revealCurrent = () => {
    if (!active || !document.querySelector(".explorer.is-loaded")) return
    for (const root of roots) if (!positioned.has(root)) {
      void revealDirectoryEntry(root, AbortSignal.any([cleanup.signal, navigation.signal])).then(revealed => { if (revealed) positioned.add(root) })
    }
  }
  const markLink = (link: HTMLAnchorElement) => {
    const target = driveRoute(new URL(link.href))
    const movie = link.closest<HTMLLIElement>("li[data-drive-movie-key]")
    // The link resolves before the directory redirects to its sole video.
    // Both routes represent the same leaf, so keep its selection throughout.
    const movieFile = movie && !movie.querySelector(":scope > .drive-branch") && movie.dataset.driveMovieShare === route.share &&
      (movie.dataset.driveMoviePath === currentPath ||
        movie.dataset.driveMoviePath === (currentPath.slice(0, currentPath.lastIndexOf("/")) || "/"))
    const match = active && target.valid && target.view === route.view && target.share === route.share &&
      (target.path === currentPath || route.view === "share" && Boolean(movieFile))
    const portal = active && route.view === "guest" && link.parentElement?.parentElement?.classList.contains("drive-nav")
    link.classList.toggle("active", Boolean(match || portal))
    if (match) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current")
  }
  const markLinks = () => { for (const root of roots) for (const link of root.querySelectorAll<HTMLAnchorElement>("a")) markLink(link) }
  const closeSiblingBranches = (details: HTMLDetailsElement, animate = false) => {
    let current: HTMLDetailsElement | null = details
    while (current?.classList.contains("drive-branch")) {
      const list: HTMLElement | null | undefined = current.parentElement?.parentElement
      for (const sibling of list?.querySelectorAll<HTMLDetailsElement>(":scope > li > .drive-branch") || []) {
        if (sibling === current) continue
        for (const branch of [sibling, ...sibling.querySelectorAll<HTMLDetailsElement>(".drive-branch")]) {
          expanded.delete(branch.dataset.driveTreeKey!)
          setRouteDirectoryOpen(branch, false, animate)
        }
      }
      current = list?.closest<HTMLDetailsElement>(".drive-branch, .drive-nav") || null
    }
  }
  const bindArrow = (details: HTMLDetailsElement) => {
    const button = details.querySelector<HTMLButtonElement>(":scope > summary > .drive-folder-toggle")!
    const update = () => {
      button.setAttribute("aria-expanded", String(details.open))
      button.setAttribute("aria-label", `${details.open ? "收起" : "展开"} ${details.querySelector(":scope > summary > a")?.textContent || "目录"}`)
    }
    button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation()
      const link = details.querySelector<HTMLAnchorElement>(":scope > summary > a")!
      const target = driveRoute(new URL(link.href))
      if (!details.open || target.view === "share" && driveShareProtected(target.share) && !readDriveShareCode(target.share)) {
        activateDirectoryGroup({ domain: "drive", root: driveDirectoryRoot(details) })
      }
      if (target.view === "share" && driveShareProtected(target.share) && !readDriveShareCode(target.share)) {
        details.querySelector(":scope > ul")?.replaceChildren()
        setRouteDirectoryOpen(details, false)
        expanded.delete(details.dataset.driveTreeKey!)
        link.click(); return
      }
      if (!details.open) { closeSiblingBranches(details); details.dataset.userExpanding = "true" }
      delete details.dataset.routeUpdating
      details.open = !details.open; update()
    }, { signal: cleanup.signal })
    details.addEventListener("toggle", update, { signal: cleanup.signal }); update()
  }
  if (treeToken !== driveToken()) { expanded.clear(); clearDriveDirectoryCache(); treeToken = driveToken() }
  const linkItem = (label: string, href: string, title = label, protectedShare = false) => {
    const item = document.createElement("li"), link = document.createElement("a")
    item.dataset.driveEntryKey = href
    link.href = href; link.textContent = label; link.title = title; link.dataset.noPopover = "true"
    if (protectedShare) {
      const mark = document.createElement("span")
      mark.className = "encrypted-mark"; mark.setAttribute("role", "img"); mark.setAttribute("aria-label", "需要提取码")
      mark.innerHTML = encryptedIcon; link.prepend(mark)
    }
    item.append(link); markLink(link); return item
  }
  const loading = (list: HTMLUListElement) => {
    const item = document.createElement("li"), stars = document.createElement("span")
    item.className = "drive-nav-status"; stars.className = "loading-stars"; stars.setAttribute("role", "status"); stars.setAttribute("aria-label", "正在读取目录")
    for (let i = 0; i < 5; i++) { const star = document.createElement("i"); star.setAttribute("aria-hidden", "true"); stars.append(star) }
    item.append(stars); list.replaceChildren(item)
  }
  const branch = (key: string, label: string, href: string, loader: (list: HTMLUListElement) => Promise<void>, protectedShare = false) => {
    const item = document.createElement("li"), details = document.createElement("details"), summary = document.createElement("summary"), list = document.createElement("ul")
    item.dataset.driveEntryKey = href
    details.className = "drive-branch"; details.dataset.driveTreeKey = key
    summary.tabIndex = -1; summary.innerHTML = `<button type="button" class="drive-folder-toggle">${chevron}</button>`
    summary.append(linkItem(label, href, label, protectedShare).firstElementChild!)
    details.append(summary, list); item.append(details)
    let loaded = false, loadedAt = 0, pending: Promise<void> | undefined
    const load = (): Promise<void> => {
      if (cleanup.signal.aborted || loaded && Date.now() - loadedAt < DIRECTORY_CACHE_TTL) return Promise.resolve()
      if (pending) return pending
      if (key.startsWith("share:")) {
        const [id] = JSON.parse(key.slice(6)) as [string, string]
        if (driveShareProtected(id) && !readDriveShareCode(id)) { list.replaceChildren(); return Promise.resolve() }
      }
      pending = (async () => {
        if (!loaded) loading(list)
        list.setAttribute("aria-busy", "true")
        try {
          await loader(list)
          if (!cleanup.signal.aborted) { loaded = true; loadedAt = Date.now() }
        } catch (error) {
          if (!cleanup.signal.aborted && key.startsWith("share:") && error instanceof DriveError && [202, 403].includes(error.code)) {
            loaded = false; list.replaceChildren()
            setRouteDirectoryOpen(details, false); expanded.delete(key)
            if (details.dataset.userExpanding === "true") summary.querySelector<HTMLAnchorElement>("a")!.click()
            return
          }
          if (!cleanup.signal.aborted && error instanceof DriveError && error.code === 401 && !key.startsWith("share:")) { setDriveToken(""); return }
          if (!cleanup.signal.aborted && (!loaded || error instanceof DriveError && error.code === 403)) {
            loaded = false
            list.replaceChildren(); const retry = document.createElement("button"), li = document.createElement("li")
            li.className = "drive-nav-status"; retry.type = "button"; retry.textContent = "重新读取目录"
            retry.addEventListener("click", () => {
              void load()
            }, { signal: cleanup.signal }); li.append(retry); list.append(li)
          }
        } finally { delete details.dataset.userExpanding; list.setAttribute("aria-busy", "false"); markLinks(); revealCurrent() }
      })().finally(() => { pending = undefined })
      return pending
    }
    loaders.set(details, load)
    setRouteDirectoryOpen(details, !resetHome && (expanded.has(key) || onPath(key)), false)
    details.addEventListener("toggle", () => {
      if (!consumeRouteDirectoryToggle(details)) {
        if (details.open) expanded.add(key); else expanded.delete(key)
      }
      if (details.open) void load()
      for (const other of document.querySelectorAll<HTMLDetailsElement>(".drive-branch")) {
        if (other !== details && other.dataset.driveTreeKey === key) setRouteDirectoryOpen(other, details.open)
      }
    }, { signal: cleanup.signal })
    bindArrow(details)
    if (details.open) void load()
    return item
  }
  const storageChildren = async (list: HTMLUListElement, path: string) => {
    const token = driveToken()
    if (!token) { list.replaceChildren(); return }
    await requireDriveUser(cleanup.signal)
    route = driveRoute(current); currentPath = route.path
    let page = 1, total = 0
    const files: DriveFile[] = []
    const desiredPages = loadedPages.get(list) || 1
    const childName = active && route.view === "storage" && currentPath.startsWith(`${path}/`)
      ? currentPath.slice(path.length + 1).split("/")[0] : ""
    do {
      const data = await readDriveDirectory(path, page, cleanup.signal)
      if (cleanup.signal.aborted || token !== driveToken()) return
      files.push(...(data.content || [])); total = path === "/" ? files.length : data.total
      const missingCurrent = childName && !files.some(file => file.name === childName)
      if (path === "/" || page * 100 >= total || !data.content?.length || page >= desiredPages && !missingCurrent) break
      page++
    } while (true)
    loadedPages.set(list, page)
    const signature = JSON.stringify([page, total, files.map(file => [file.name, file.is_dir])])
    if (signatures.get(list) === signature) return
    const existing = new Map([...list.children].map(item => [(item as HTMLElement).dataset.driveEntryKey, item as HTMLLIElement]))
    const items = sortDriveFiles(files, "name").map(file => {
      const child = joinDrivePath(path, file.name), href = driveHref("storage", child, "", file.is_dir)
      return existing.get(href) || (file.is_dir
        ? branch(`folder:${child}`, file.name, href, children => storageChildren(children, child))
        : linkItem(file.name, href))
    })
    if (path !== "/" && page * 100 < total) {
      const li = document.createElement("li"), more = document.createElement("button")
      li.className = "drive-nav-status"; more.type = "button"; more.textContent = "加载更多"
      more.addEventListener("click", async () => {
        more.disabled = true; loadedPages.set(list, page + 1)
        try { await storageChildren(list, path) }
        catch { loadedPages.set(list, page); more.disabled = false; more.textContent = "重试加载更多" }
      }, { signal: cleanup.signal }); li.append(more); items.push(li)
    }
    reconcile(list, items); signatures.set(list, signature)
  }
  const reusableShareItem = (item?: HTMLLIElement) => item
  const shareFolder = (id: string, path: string, label: string, protectedShare = false): HTMLLIElement => {
    const href = driveHref("share", path, id, true)
    const loadChildren = async (list: HTMLUListElement): Promise<void> => {
      const password = drivePassword("share", id, path)
      if (protectedShare && !password) throw new DriveError("请输入提取码", 403)
      if (path === "/") {
        try {
          const meta = await driveRequest<DriveFile>("fs/get", { path: `/@s/${id}`, password }, { anonymous: true, signal: cleanup.signal })
          if (cleanup.signal.aborted) return
          if (!meta.is_dir) {
            const item = list.closest("li")!
            item.replaceChildren(...linkItem(label, driveHref("share", path, id, false), label, protectedShare).childNodes)
            return
          }
        } catch (error) {
          if (error instanceof DriveError && [202, 403].includes(error.code)) forgetDriveShareCode(id)
          throw error
        }
      }
      const desiredPages = loadedPages.get(list) || 1
      const readFiles = async (folder: string) => {
        let page = 1, total = 0
        const files: DriveFile[] = []
        const childName = active && route.view === "share" && route.share === id && (folder === "/" || currentPath.startsWith(`${folder}/`))
          ? currentPath.slice(folder === "/" ? 1 : folder.length + 1).split("/")[0] : ""
        do {
          const data = await readDriveDirectory(folder, page, cleanup.signal, id)
          if (cleanup.signal.aborted) return { files, page, total }
          files.push(...(data.content || [])); total = data.total
          if (page * 100 >= total || !data.content?.length || page >= desiredPages && (!childName || files.some(file => file.name === childName))) break
          page++
        } while (true)
        loadedPages.set(list, page)
        return { files, page, total }
      }
      let listingPath = path
      let { files, page, total } = await readFiles(listingPath)
      const aliases = await fetchDriveAliases(id, cleanup.signal, path).catch(() => ({} as Record<string, string>))
      const mediaEnabled = (await fetchDriveEntries()).some(entry => entry.kind === "share" && entry.id === id && entry.jellyfin)
      const mediaNames = new Map<string, string>()
      let media: MediaListing | undefined
      if (mediaEnabled) {
        try {
          media = await fetchDriveMedia(`/@s/${id}${listingPath === "/" ? "" : listingPath}`, password, cleanup.signal)
          if (cleanup.signal.aborted) return
          if (media.autoDirectory) {
            const seasonPath = joinDrivePath(path, media.autoDirectory)
            const seasonFiles = await readFiles(seasonPath)
            if (cleanup.signal.aborted) return
            listingPath = seasonPath
            ;({ files, page, total } = seasonFiles)
            media = await fetchDriveMedia(`/@s/${id}${listingPath}`, password, cleanup.signal)
          }
          for (const entry of media.entries) if (entry.media) mediaNames.set(entry.name, entry.media.title)
        } catch { /* Keep raw names if metadata is unavailable. Authorized file reads still enforce access. */ }
      }
      const summary = list.parentElement?.querySelector<HTMLAnchorElement>(":scope > summary > a")
      if (summary) {
        summary.href = driveHref("share", listingPath, id, true)
        const text = [...summary.childNodes].find(node => node.nodeType === Node.TEXT_NODE)
        const alias = aliases[listingPath] || aliases[path]
        if (alias && text) text.textContent = alias
        if (alias) summary.title = alias
        markLink(summary)
      }
      if (cleanup.signal.aborted) return
      const existing = new Map([...list.children].map(item => [(item as HTMLElement).dataset.driveEntryKey, item as HTMLLIElement]))
      const items = sortDriveFiles(files.filter(file => !mediaEnabled || file.is_dir || !isMediaSidecar(file.name)), "name").map(file => {
        const child = joinDrivePath(listingPath, file.name), url = driveHref("share", child, id, file.is_dir)
        const label = aliases[child] || mediaNames.get(file.name) || file.name
        const movie = file.is_dir && media?.entries.some(entry => entry.name === file.name && entry.media?.type === "Movie")
        const target = movie ? movieTreeTargets.get(movieTreeKey(id, child)) : undefined
        const directory = movie ? target?.directory === true : file.is_dir
        const targetHref = driveHref("share", target?.path || child, id, directory)
        const prior = reusableShareItem(existing.get(url))
        const sameMovieKind = movie && prior?.dataset.driveMovieKey === movieTreeKey(id, child) &&
          Boolean(prior.querySelector(":scope > .drive-branch")) === directory
        const item = prior && (prior.dataset.driveMediaTarget === targetHref || sameMovieKind) ? prior
          : movie ? movieItem(id, child, label) : directory ? shareFolder(id, child, label) : linkItem(label, targetHref)
        item.dataset.driveEntryKey = url; item.dataset.driveMediaTarget = targetHref
        const link = item.querySelector("a")!
        if (sameMovieKind) link.href = targetHref
        const text = [...link.childNodes].find(child => child.nodeType === Node.TEXT_NODE)
        if (text) text.textContent = label
        link.title = label
        return item
      })
      if (page * 100 < total) {
        const li = document.createElement("li"), more = document.createElement("button")
        li.className = "drive-nav-status"; more.type = "button"; more.textContent = "加载更多"
        more.addEventListener("click", async () => {
          more.disabled = true; loadedPages.set(list, page + 1)
          try { await loadChildren(list) }
          catch { loadedPages.set(list, page); more.textContent = "重试加载更多" }
          finally { more.disabled = false }
        }, { signal: cleanup.signal })
        li.append(more); items.push(li)
      }
      reconcile(list, items)
    }
    return branch(shareKey(id, path), label, href, loadChildren, protectedShare)
  }
  // A movie starts as a leaf using metadata already returned for this level.
  // Only an actual page visit can confirm that it needs a directory branch.
  const movieItem = (id: string, path: string, label: string) => {
    const target = movieTreeTargets.get(movieTreeKey(id, path))
    const href = driveHref("share", target?.path || path, id, target?.directory === true)
    const item = target?.directory ? shareFolder(id, path, label) : linkItem(label, href)
    item.dataset.driveEntryKey = driveHref("share", path, id, true)
    item.dataset.driveMediaTarget = href
    item.dataset.driveMovieKey = movieTreeKey(id, path)
    item.dataset.driveMovieShare = id; item.dataset.driveMoviePath = path
    return item
  }
  document.addEventListener("drive-movie-tree-changed", event => {
    const { key, target: resolved } = (event as CustomEvent<{ key: string; target: { directory: boolean; path: string } }>).detail
    // The shared target cache and the retained tree must update together.
    movieTreeTargets.set(key, resolved)
    for (const root of roots) for (const item of root.querySelectorAll<HTMLLIElement>("li[data-drive-movie-key]")) {
      if (item.dataset.driveMovieKey !== key) continue
      const id = item.dataset.driveMovieShare!, path = item.dataset.driveMoviePath!, target = movieTreeTargets.get(key)
      if (!target) continue
      const href = driveHref("share", target.path, id, target.directory)
      if (item.dataset.driveMediaTarget === href) continue
      if (Boolean(item.querySelector(":scope > .drive-branch")) === target.directory) {
        // Resolving a single-file movie only changes its destination. Keep the
        // existing leaf, focus and selection instead of replacing the tree row.
        item.querySelector<HTMLAnchorElement>("a")!.href = href
        item.dataset.driveMediaTarget = href
      } else {
        item.replaceWith(movieItem(id, path, item.querySelector("a")?.textContent || path.split("/").at(-1)!))
      }
    }
    markLinks(); revealCurrent()
  }, { signal: cleanup.signal })
  const guestItems = async (path:string):Promise<HTMLLIElement[]> => {
    const data=await readGuestFiles(path)
    return sortDriveFiles(data.content||[],"name").map(file=>{
      const child=joinDrivePath(path,file.name),href=driveHref('guest',child,'',file.is_dir)
      return file.is_dir?branch(`guest:${child}`,file.name,href,async list=>{const items=await guestItems(child);if(!cleanup.signal.aborted)reconcile(list,items)}):linkItem(file.name,href)
    })
  }
  const rendering=new WeakMap<HTMLDetailsElement,object>()
  const render = (root: HTMLDetailsElement) => {
    const list=root.querySelector<HTMLUListElement>("[data-drive-entry-list]")!,request={}
    rendering.set(root,request)
    void Promise.all([fetchDriveEntries(),guestItems('/')]).then(([entries,guest])=>{
      if(cleanup.signal.aborted||rendering.get(root)!==request)return
      const items:HTMLLIElement[]=[]
      if(driveToken())items.push(branch("storage","空间",driveHref("storage"),children=>storageChildren(children,"/")))
      items.push(...guest,...entries.filter((entry):entry is Extract<typeof entry,{kind:'share'}>=>entry.kind==='share').map(entry=>{
        const item=shareFolder(entry.id,'/',entry.id,entry.protected)
        item.querySelector('a')!.title=`${entry.title}${entry.protected?' · 需要提取码':''}`
        return item
      }))
      reconcile(list,items);list.setAttribute('aria-busy','false');markLinks();revealCurrent()
    }).catch(()=>{if(!cleanup.signal.aborted&&rendering.get(root)===request){list.textContent='Share 暂时无法读取';list.setAttribute('aria-busy','false')}})
  }
  for (const root of roots) {
    setRouteDirectoryOpen(root, !resetHome && (active || localStorage.getItem("drive-directory-open") === "true"), false)
    render(root); bindArrow(root)
    root.addEventListener("toggle", () => {
      if (!consumeRouteDirectoryToggle(root)) {
        try { localStorage.setItem("drive-directory-open", String(root.open)) } catch {}
      }
      for (const other of roots) if (other !== root) setRouteDirectoryOpen(other, root.open)
    }, { signal: cleanup.signal })
  }
  const closeOtherGroups = (group: DirectoryGroup | undefined, animate = false) => {
    if (!group) return
    for (const root of roots) {
      if (group.domain === "drive" && driveDirectoryRoot(root) === group.root) continue
      setRouteDirectoryOpen(root, false, animate)
      for (const details of root.querySelectorAll<HTMLDetailsElement>(".drive-branch")) {
        expanded.delete(details.dataset.driveTreeKey!)
        setRouteDirectoryOpen(details, false, animate)
      }
      try { localStorage.setItem("drive-directory-open", "false") } catch {}
    }
  }
  document.addEventListener("directory-group-change", event => closeOtherGroups((event as CustomEvent<DirectoryGroup | undefined>).detail, false), { signal: cleanup.signal })
  for (const root of roots) root.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.target.closest("a")) return
    const mouse = event as MouseEvent
    if (mouse.button === 0 && !mouse.ctrlKey && !mouse.metaKey && !mouse.shiftKey && !mouse.altKey) {
      const details = event.target.closest<HTMLDetailsElement>(".drive-branch, .drive-nav") || root
      const link = event.target.closest("a")
      if (link === details.querySelector(":scope > summary > a")) {
        for (const child of details.querySelectorAll<HTMLDetailsElement>(".drive-branch")) {
          expanded.delete(child.dataset.driveTreeKey!)
          setRouteDirectoryOpen(child, false, false)
        }
      }
      closeSiblingBranches(details)
      activateDirectoryGroup({ domain: "drive", root: driveDirectoryRoot(root) })
    }
  }, { signal: cleanup.signal })
  const update = (resetHome = false) => {
    if (resetHome) {
      expanded.clear()
      try { localStorage.setItem("drive-directory-open", "false") } catch {}
    }
    navigation.abort(); navigation = new AbortController(); positioned = new WeakSet()
    current = new URL(location.href); route = driveRoute(current)
    active = document.body.dataset.slug === "Share/index"; currentPath = route.path
    for (const root of roots) {
      setRouteDirectoryOpen(root, !resetHome && (root.open || active || localStorage.getItem("drive-directory-open") === "true"))
      for (const details of root.querySelectorAll<HTMLDetailsElement>(".drive-branch")) {
        const key = details.dataset.driveTreeKey!
        setRouteDirectoryOpen(details, !resetHome && (details.open || expanded.has(key) || onPath(key)))
        if (!resetHome && onPath(key)) closeSiblingBranches(details, false)
        if (!resetHome && onPath(key)) void loaders.get(details)?.()
      }
    }
    closeOtherGroups(activeDirectoryGroup())
    markLinks(); revealCurrent()
  }
  const reset = () => {
    clearDriveDirectoryCache(); expanded.clear(); treeToken = driveToken()
    for (const root of roots) render(root)
    update()
  }
  document.addEventListener("directory-ready", revealCurrent, { signal: cleanup.signal })
  document.addEventListener("drive-admin-ready", reset, { signal: cleanup.signal })
  document.addEventListener("drive-auth-change", reset, { signal: cleanup.signal })
  document.addEventListener("drive-directory-unlocked", reset, { signal: cleanup.signal })
  document.addEventListener("drive-files-changed", reset, { signal: cleanup.signal })
  const dispose = () => {
    cleanup.abort(); navigation.abort(); clearDriveDirectoryCache()
    if (controller?.roots === roots) controller = undefined
  }
  controller = { roots, update, dispose }
  addDirectoryCleanup(roots[0], dispose)
  update(resetHome)
}
