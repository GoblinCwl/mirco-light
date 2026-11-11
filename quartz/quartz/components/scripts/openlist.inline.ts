import {syncShareAdminSession} from './shareAdminSession'
import {requireDriveUser as readAuthorizedDriveUser} from './driveClient'
import {showShareGraph} from './shareGraphVisibility'
import {managedShareTarget} from './driveShareManagement'
import {readGuestFiles} from './shareGuestFiles'
import { fetchDriveAliases } from "./driveAliases"
import { createInfiniteScroll } from "./infiniteScroll"
import type { DriveEpisode } from "./driveEpisodes"
import { isDriveImageViewDisabled, isSpaceRootOperationDisabled } from "./driveOperationRules"
import { tagHref } from "./shareContent"
import { slugTag } from "../../util/path"
import { beginDriveLoading, setupDriveLoading } from "./driveLoading"
import { setupDrivePreview } from "./drivePreview"
import { setupDriveContextMenu } from "./driveContextMenu"
import { isDriveImageEntry, renderDriveImages } from "./driveImageView"
import { fetchDriveCollections, fetchDriveMedia, type MediaCollection, isMediaSidecar, rememberMovieTreeTarget, renderDriveMedia, renderMediaSummary, type MediaInfo } from "./driveMediaView"
import { setupDriveActions } from "./driveActions"
import { setupDriveOperations } from "./driveOperations"
import { showPasswordToast } from "./passwordFeedback"
import { encryptedIcon, updateTitleLock } from "../../util/encryptedIcon"
import { formatDateWithSeconds, formatDirectoryDate, SITE_DATE_TIME_ZONE } from "../../util/formatDate"
import { DRIVE_ORIGIN, DriveFile, driveDownloadUrl, driveSize, joinDrivePath } from "./openlistShared"
import { DriveError, DriveUser, driveDirectoryTitle, drivePathKey, drivePathKinds, driveHref, drivePassword, drivePasswordKey, drivePasswords, rememberDriveShareCode, forgetDriveShareCode, driveRequest, driveRoute, driveToken, cachedDriveUser, requireDriveUser, setDriveToken } from "./driveClient"
import { renderDriveMetadata } from "./driveMetadata"
import { DriveEntry, driveEntryHref, driveShareName, driveShareProtected, driveShareMedia, fetchDriveEntries } from "./driveEntries"
import { fileIcon, fileIconForName, node } from "./driveUi"

document.addEventListener("nav", () => {
  const root = document.querySelector<HTMLElement>("[data-openlist]")
  if (!root) return
  const get = <T extends HTMLElement = HTMLElement>(name: string) => {
    const sharedGate: Record<string, string> = { "unlock-form": ".password-gate-form", "unlock-title": ".password-gate-message", "unlock-error": ".password-gate-error" }
    return root.querySelector<T>(sharedGate[name] || `[data-drive-${name}]`)!
  }
  const url = new URL(location.href), route = driveRoute(url)
  const notFound = () => document.dispatchEvent(new CustomEvent("quartz-not-found"))
  if (!route.valid) { notFound(); return }
  const { view, share } = route, anonymous = view === "guest" || view === "share"
  const knownMediaMode = view === "share" ? driveShareMedia(share) : false
  let mediaEnabled = knownMediaMode === true, mediaModePending = knownMediaMode === undefined
  root.classList.toggle("is-media-view", mediaEnabled)
  root.toggleAttribute("data-share-mode-pending", mediaModePending)
  if (view === "share") root.dataset.driveShare = share
  let path = route.path
  const reserveModified = path !== "/" || view === "share"
  const shareGraph = document.querySelector<HTMLElement>("[data-drive-share-graph]")
  if (shareGraph && (mediaEnabled || !shareGraph.hasAttribute("data-graph-retained"))) shareGraph.hidden = true
  const shareComments = document.querySelector<HTMLElement>("[data-drive-share-comments]")
  const shareTags = node("ul", "", "tags"); shareTags.dataset.driveShareTags = ""; shareTags.hidden = true
  root.closest(".center")!.querySelector(".page-header .popover-hint")!.append(shareTags)
  const renderShareTags = (tags: string[]) => {
    shareTags.replaceChildren(...tags.map((tag: string) => {
      const li = node("li"), link = node("a", tag, "internal tag-link")
      link.href = tagHref(slugTag(tag)); link.dataset.noPopover = "true"; li.append(link); return li
    }))
    shareTags.hidden = !shareTags.childElementCount && !shareTags.hasAttribute("data-password-tag-slot")
  }
  const setupSharePage = async (signal: AbortSignal) => {
    if (view !== "share" || path !== "/" || !shareComments || mediaEnabled) return
    const response = await fetch("/api/drive/share-page", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: share }), signal })
    const result = await response.json()
    if (!response.ok || signal.aborted) return
    renderShareTags(result.tags || [])
    shareComments.dataset.pageKey = result.key; shareComments.dataset.pageTitle = result.title
    shareComments.dataset.adminOnly = String(result.comment !== true)
    shareComments.classList.toggle("artalk-admin-only-pending", result.comment !== true)
    shareComments.dataset.driveShareComments = "ready"; shareComments.hidden = false
    root.closest(".center")!.classList.add("has-share-comments")
    document.dispatchEvent(new CustomEvent("drive-share-comments-ready"))
  }
  const list = get("list"), message = get("message"), previewBody = get("preview-body")
  const mediaSummary = node("section", "", "drive-media-summary"); mediaSummary.hidden = true; get("listing").before(mediaSummary)
  const mediaOverview = node("section", "", "drive-media-overview-panel"); mediaOverview.hidden = true; mediaOverview.setAttribute("aria-label", "剧情简介"); get("preview").after(mediaOverview)
  const inlineEpisodes = node("div"); inlineEpisodes.dataset.driveInlineEpisodes = ""; mediaOverview.after(inlineEpisodes)
  const heading = root.closest(".center")!.querySelector<HTMLElement>(".article-title")!
  const headingCopy = heading.querySelector<HTMLElement>(".article-title-copy")!
  const breadcrumbs = root.closest(".center")!.querySelector<HTMLElement>(".breadcrumb-container")!
  const modifiedMeta = root.closest(".center")!.querySelector<HTMLElement>("[data-page-modified]")!
  const modifiedTime = modifiedMeta.querySelector<HTMLTimeElement>("time")!
  let sharedAt=''
  const setModified = (value: string, reserve = false) => {
    if (view === "share") {
      modifiedMeta.style.visibility=heading.style.visibility
      const date=new Date(sharedAt);modifiedMeta.hidden=path!=='/'||!Number.isFinite(date.getTime());modifiedMeta.querySelector('span')!.replaceChildren(document.createTextNode('分享于：'),modifiedTime);modifiedTime.textContent=modifiedMeta.hidden?'':formatDateWithSeconds(date,modifiedMeta.dataset.locale,true);if(!modifiedMeta.hidden)modifiedTime.dateTime=date.toISOString();return
    }
    const date = new Date(value), valid = Number.isFinite(date.getTime())
    modifiedMeta.hidden = !valid && !reserve
    modifiedMeta.querySelector<HTMLElement>("span")!.style.visibility = ""
    modifiedTime.textContent = valid ? formatDateWithSeconds(date, modifiedMeta.dataset.locale, true) : reserve ? "—" : ""
    modifiedTime.classList.toggle("is-unavailable", !valid && reserve)
    if (valid) modifiedTime.dateTime = date.toISOString(); else modifiedTime.removeAttribute("datetime")
  }
  let shareUnlocked = Boolean(shareGraph?.hasAttribute("data-graph-retained"))
  const setProtected = (protectedShare: boolean) => {
    updateTitleLock(heading, protectedShare && (view !== "share" || path === "/") ? !shareUnlocked : null)
    if (view === "share") {
      const reserveLockedHeader = !mediaEnabled && path === "/" && protectedShare && !shareUnlocked
      shareTags.toggleAttribute("data-password-tag-slot", reserveLockedHeader)
      shareTags.hidden = !shareTags.childElementCount && !reserveLockedHeader
    }
    if (shareGraph) {
      const visible = showShareGraph(view,shareUnlocked,mediaModePending||mediaEnabled&&!mediaNamesReady,mediaEnabled&&Boolean(currentMedia||mediaFiles.size))
      const wasHidden = shareGraph.hidden
      shareGraph.hidden = !visible
      if (visible && wasHidden) document.dispatchEvent(new CustomEvent("drive-share-graph-ready"))
    }
  }
  const crumbTemplate = breadcrumbs.firstElementChild!.cloneNode(true) as HTMLElement
  const unlockForm = get<HTMLFormElement>("unlock-form")
  const lifecycle = new AbortController()
  const paging = createInfiniteScroll(get("pagination"), () => {
    if (!loading && visibleEntries.length < total) { page++; renderFiles(true) }
  }, { signal: lifecycle.signal })
  if (shareGraph) {
    const home = document.createComment("share graph sidebar position")
    shareGraph.before(home)
    const compactGraph = window.matchMedia("(max-width: 1199px)")
    const placeGraph = () => {
      if (compactGraph.matches) {
        const center = root.closest(".center")!
        center.insertBefore(shareGraph, center.querySelector(":scope > .page-footer"))
      } else home.after(shareGraph)
    }
    placeGraph()
    compactGraph.addEventListener("change", placeGraph)
    lifecycle.signal.addEventListener("abort", () => compactGraph.removeEventListener("change", placeGraph), { once: true })
  }
  document.addEventListener('drive-admin-ready',()=>{
    accountUser=cachedDriveUser();account()
    if(view==='guest'&&path==='/'&&!get('content').hidden)renderFiles()
  },{signal:lifecycle.signal})
  setupDriveLoading(root, lifecycle.signal)
  let thumbnailController = new AbortController()
  let viewPreferenceKey = `quartz-drive-list-view:${drivePathKey(view, share, path)}`
  let imageView = false
  try { imageView = !isDriveImageViewDisabled(view, path) && localStorage.getItem(viewPreferenceKey) === "images" } catch {}
  let controller = new AbortController(), files: DriveFile[] = [], sharedEntries: DriveEntry[] = []
  let currentFileSize: number | undefined
  let mediaEpisodes: DriveEpisode[] = []
  let mediaCollections: MediaCollection[] = []
  let mediaProgramTitle: string | undefined, mediaSeasonTitle: string | undefined
  let currentMedia: MediaInfo | undefined, mediaFiles = new Map<string, MediaInfo>()
  let aliases: Record<string, string> = {}
  let mediaNamesReady = view !== "share"
  let mediaSourceName: string | undefined
  let collapseMovieParent = false
  const mediaTitles = new Map<string, string>()
  const collapsedSeasons = new Map<string, { seriesPath: string; title: string }>()
  let page = 1, total = 0, loading = false, writable = false, user: DriveUser | undefined, accountUser: DriveUser | undefined = cachedDriveUser(), shareRootName = driveShareName(share) || "分享文件"
  const listen = (target: EventTarget, event: string, callback: EventListener) => target.addEventListener(event, callback, { signal: lifecycle.signal })
  const requestPath = (value: string) => view === "share" ? `/@s/${share}${value === "/" ? "" : value}` : value
  const requestOptions = (signal: AbortSignal) => ({ anonymous, signal })
  const password = (value = path) => drivePassword(view, share, value)
  const parameterPassword = view === "share" ? url.searchParams.get("p") : null
  if (parameterPassword) drivePasswords.set(drivePasswordKey(view, share, path), parameterPassword)
  const href = (value: string, directory = true) => driveHref(view, value, share, directory)
  const caption = view === "storage" ? "空间" : view === "guest" ? "Share" : "分享"
  let directoryPage = path === "/" && view !== "share" ? true
    : drivePathKinds.get(drivePathKey(view, share, path)) ?? url.pathname.endsWith("/")
  const title = (value: string) => {
    if ((!value || directoryPage === undefined) && heading.hasAttribute("data-drive-title-retained")) return
    heading.style.visibility = value && directoryPage !== undefined ? "" : "hidden"
    if(view==='share')modifiedMeta.style.visibility=heading.style.visibility
    if (!value || directoryPage === undefined) { heading.setAttribute("aria-busy", "true"); return }
    heading.removeAttribute("aria-busy")
    heading.dataset.driveTitleReady = ""
    delete heading.dataset.driveTitleRetained
    const text = [...headingCopy.childNodes].find(child => child.nodeType === Node.TEXT_NODE)
    const label = (view === "share" ? aliases[path] : undefined) || (currentMedia?.type === "Season" ? aliases[collapsedSeasons.get(path)?.seriesPath || ""] || collapsedSeasons.get(path)?.title : collapseMovieParent ? aliases[path.slice(0, path.lastIndexOf("/")) || "/"] : undefined) || currentMedia?.title || (view === "share" && path === "/" ? share : directoryPage ? driveDirectoryTitle(view, path, share) : value)
    if (text) text.textContent = label
    headingCopy.setAttribute("aria-label", `复制文章链接：${label}`)
    document.title = `${label} · 微光集`
    if(view==='share')setModified('')
  }
  const stopMedia = () => {
    for (const media of previewBody.querySelectorAll<HTMLMediaElement>("audio,video")) { media.pause(); media.removeAttribute("src"); media.load() }
  }
  const show = (name: string) => { for (const panel of ["boot", "auth", "unlock", "content"]) get(panel).hidden = panel !== name; get("heading").hidden = name === "unlock" }
  let ownShares = new Set<string>(), ownSharesAccount = "", ownSharesRequest = 0
  const account = () => {
    updateOperations()
    if (!(view === "guest" && path === "/")) return
    const token = driveToken(), owner = accountUser?.username
    const identity = token && owner ? JSON.stringify([token, owner]) : ""
    if (!identity) { ownShares.clear(); ownSharesAccount = ""; ownSharesRequest++; return }
    if (identity === ownSharesAccount) return
    ownSharesAccount = identity; ownShares.clear()
    const request = ++ownSharesRequest
    if (accountUser!.role !== 2) return
    // Ownership comes from the authenticated share list, never the public entries.
    const owned=async()=>{
      const entries:{id:string;creator:string}[]=[]
      for(let page=1;page<=1000;page++){
        const result=await driveRequest<{content:{id:string;creator:string}[];total:number}>(`share/list?page=${page}&per_page=100`,undefined,{token,signal:lifecycle.signal})
        entries.push(...result.content||[])
        if(entries.length>=result.total||(result.content||[]).length<100)return entries
      }
      throw new Error('分享列表不完整')
    }
    void owned().then(entries => {
      if (lifecycle.signal.aborted || request !== ownSharesRequest || driveToken() !== token || accountUser?.username !== owner) return
      ownShares = new Set(entries.filter(entry => entry.creator === owner).map(entry => entry.id))
      updateOperations()
    }).catch(() => { /* Until ownership is verified, no edit action is offered. */ })
  }
  const pathLinks = () => {
    if (!mediaNamesReady) return
    const trail = document.createDocumentFragment()
    const add = (label: string, target: string, active = false) => {
      const crumb = crumbTemplate.cloneNode(true) as HTMLElement
      const link = crumb.querySelector("a")!
      link.textContent = label; link.href = target
      if (active) link.setAttribute("aria-current", "location")
      trail.append(crumb)
    }
    add("Home", "/")
    add("Share", driveHref("guest"), view === "guest" && path === "/")
    if (view === "storage") add(caption, href("/"), path === "/")
    const rootSeason = [...collapsedSeasons].find(([, series]) => series.seriesPath === "/")?.[0]
    if (view === "share") add(share, href(rootSeason || "/"), path === "/" || path === rootSeason)
    let parent = ""
    const parts = path.split("/").filter(Boolean)
    for (const [index, part] of parts.entries()) {
      parent += `/${part}`
      if (!aliases[parent] && (collapseMovieParent && index === parts.length - 2 || collapsedSeasons.has(parent))) continue
      const season = [...collapsedSeasons].find(([, series]) => series.seriesPath === parent)?.[0]
      add(aliases[parent] || mediaTitles.get(parent) || part, href(season || parent, parent === path ? directoryPage !== false : true), parent === path || season === path)
    }
    trail.lastElementChild?.querySelector("p")?.remove()
    const before = [...breadcrumbs.childNodes], after = [...trail.childNodes]
    if (before.length !== after.length || before.some((node, index) => !node.isEqualNode(after[index]))) breadcrumbs.replaceChildren(trail)
    breadcrumbs.dataset.driveBreadcrumbReady = ""
    delete breadcrumbs.dataset.driveBreadcrumbRetained
  }
  const fileUrl = async (meta: DriveFile, target: string, signal: AbortSignal) => {
    signal.throwIfAborted()
    if (view === "share") {
      const suffix = target === "/" ? "" : target.split("/").map(encodeURIComponent).join("/")
      const link = new URL(`/sd/${encodeURIComponent(share)}${suffix}`, DRIVE_ORIGIN)
      if (password(target)) link.searchParams.set("pwd", password(target))
      return link.href
    }
    user ??= await readAuthorizedDriveUser()
    return driveDownloadUrl(joinDrivePath(user.base_path || "/", target), meta.sign)
  }
  type SortKey = "name" | "size" | "modified"
  type ListEntry = { tags?: string[]; order?: number; alias?: string; displayName?: string; name: string; target: string; modified: string; created?: string; size?: number; directory: boolean; sign?: string; thumb?: string; shared?: boolean; protectedShare?: boolean; portal?: boolean; media?: MediaInfo; jellyfin?: boolean }
  let sortColumns: { key: SortKey; direction: number }[] = [{ key: "name", direction: 1 }]
  const selected = new Set<string>(), selectAll = get<HTMLInputElement>("select-all"), imageSelectAll = get<HTMLInputElement>("image-select-all")
  let visibleEntries: ListEntry[] = [], tableEntries: ListEntry[] = []
  const execute = setupDriveActions(lifecycle.signal, async target => {
    document.dispatchEvent(new CustomEvent("drive-files-changed"))
    selected.clear()
    if (target) await window.spaNavigate(new URL(target, location.origin))
    else await load(true)
  }, () => {
    document.dispatchEvent(new CustomEvent("drive-files-changed"))
    return load(true)
  })
  const operations = setupDriveOperations(lifecycle.signal, {
    execute: async (kind, context) => {
      if (isSpaceRootOperationDisabled(context.view, context.path, kind)) return
      if (kind === "images" || kind === "files") {
        if (mediaEnabled || isDriveImageViewDisabled(view, path) || kind === "images" && !tableEntries.some(isDriveImageEntry)) return
        imageView = kind === "images"; page = 1
        try { localStorage.setItem(viewPreferenceKey, imageView ? "images" : "files") } catch {}
        renderFiles(); return
      }
      if (kind === "batch" && !context.selected.length) {
        for (const entry of context.entries) selected.add(entry.target)
        context = { ...context, selected: context.entries }
        updateSelection()
      }
      await execute(kind, context)
    },
    clearSelection: () => { selected.clear(); updateSelection() },
  })
  const updateOperations = () => operations.update({
    view, path, share, entries: tableEntries.filter(entry=>!entry.portal), name: mediaSourceName || path.split("/").filter(Boolean).at(-1) || (view === "share" ? shareRootName : caption), mediaView: mediaEnabled, pendingShare: mediaModePending, contextPending: mediaModePending || mediaEnabled && !mediaNamesReady,
    directory: directoryPage, fileSize: currentFileSize, mediaEpisode: mediaEnabled && currentMedia?.type === "Episode", mediaSeason: currentMedia?.season, mediaProgramTitle, mediaSeasonTitle, mediaEpisodes, mediaCollections, mediaPosterKey: mediaEnabled ? currentMedia?.posterKey : undefined, mediaPosterScope: mediaEnabled && currentMedia && ["Episode", "Season", "Movie"].includes(currentMedia.type) ? driveHref(view, directoryPage ? path : path.slice(0, path.lastIndexOf("/")) || "/", share, true) : undefined, mediaPoster: mediaEnabled ? currentMedia?.poster || (currentMedia?.type !== "Episode" ? currentMedia?.image : undefined) : undefined, mediaTitle: currentMedia?.title, mediaUrl: mediaEnabled ? currentMedia?.jellyfinUrl : undefined, mediaTmdbUrl: mediaEnabled ? currentMedia?.tmdbUrl : undefined, canManageShare: accountUser?.role === 2 && Boolean((()=>{const target=managedShareTarget({view,path,share,selected:tableEntries.filter(entry=>selected.has(entry.target))});return target&&ownShares.has(driveRoute(new URL(target.target,location.origin)).share)})()), loading, imageView, user: driveToken() ? accountUser : undefined, writable,
    ready: !get("content").hidden && !loading,
    selected: tableEntries.filter(entry => selected.has(entry.target)),
  })
  listen(document, "drive-auth-change", event => {
    if ((event as CustomEvent).detail?.external) {
      const token = driveToken()
      accountUser = user = undefined; selected.clear(); updateSelection()
      if (view === "storage") {
        if (!token && path !== "/") void window.spaNavigate(new URL(driveHref("storage"), location.origin))
        else void load()
      } else if (token) {
        void requireDriveUser(lifecycle.signal).then(value => {
          if (!lifecycle.signal.aborted && driveToken() === token) { accountUser = value; account() }
        }).catch(() => { if (!lifecycle.signal.aborted && driveToken() === token) setDriveToken("") })
      }
      return
    }
    if(view==='guest'&&path==='/'&&!get('content').hidden)renderFiles()
    if (!driveToken()) { accountUser = undefined; selected.clear(); updateSelection() }
    else account()
  })
  const updateSelection = () => {
    let checked = 0
    for (const checkbox of get("listing").querySelectorAll<HTMLInputElement>("input[data-entry]")) {
      checkbox.checked = selected.has(checkbox.dataset.entry!)
      checkbox.closest("[data-drive-entry]")!.classList.toggle("is-selected", checkbox.checked)
      if (checkbox.checked) checked++
    }
    const selectable = visibleEntries.filter(entry=>!entry.portal)
    for (const checkbox of [selectAll, imageSelectAll]) {
      checkbox.checked = selectable.length > 0 && checked === selectable.length
      checkbox.indeterminate = checked > 0 && checked < selectable.length
      checkbox.disabled = selectable.length === 0
    }
    get("selection").textContent = selected.size ? `已选 ${selected.size} 项` : ""
    updateOperations()
  }
  const closeContextMenu = setupDriveContextMenu(get("listing"), lifecycle.signal, target => {
    if (!driveToken() || !accountUser) return
    if (mediaEnabled && (view !== "share" || !driveToken() || accountUser?.role !== 2)) return
    if (!["storage", "share", "guest"].includes(view) || loading || get("content").hidden) return
    const item = target.closest<HTMLElement>("[data-drive-entry]")
    const entry = tableEntries.find(entry => entry.target === item?.dataset.driveEntry && !entry.portal)
    if (!entry || view === "guest" && !entry.shared) return
    if (view === "share") {
      selected.clear(); selected.add(entry.target); updateSelection()
      const link = document.querySelector<HTMLButtonElement>('[data-drive-operation-groups] [data-operation="link"]')
      const buttons = link && !mediaEnabled ? [link] : []
      if (driveToken() && accountUser?.role === 2) {
        const button = node("button", "", "drive-operation-action is-applicable"), icon = node("span", "", "drive-operation-icon")
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>'
        button.type = "button"; button.dataset.operation = "alias"; button.append(icon, node("span", "设置别名")); buttons.push(button)
      }
      return { name: entry.displayName || entry.name, buttons, execute: kind => execute(kind, {
        view, path, share, name: entry.name, directory: directoryPage, user: accountUser,
        selected: [entry], entries: tableEntries.filter(item => !item.portal),
      }) }
    }
    if (view === "guest" && entry.shared) {
      if (!entry.shared) return
      selected.clear(); selected.add(entry.target); updateSelection()
      const source = document.querySelector<HTMLButtonElement>('[data-drive-operation-groups] [data-operation="link"]')
      if (!source) return
      const link = source.cloneNode(true) as HTMLButtonElement
      link.querySelector("span:last-child")!.textContent = "复制链接"
      link.title = "复制链接"
      const buttons = [link]
      if (driveToken() && accountUser?.role === 2 && ownShares.has(driveRoute(new URL(entry.target, location.origin)).share)) {
        const button = node("button", "", "drive-operation-action is-applicable"), icon = node("span", "", "drive-operation-icon")
        icon.setAttribute("aria-hidden", "true"); icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>'
        button.type = "button"; button.dataset.operation = "edit-share"; button.append(icon, node("span", "编辑分享"))
        const remove = node("button", "", "drive-operation-action is-applicable is-danger"), trash = node("span", "", "drive-operation-icon")
        trash.setAttribute("aria-hidden", "true"); trash.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>'
        remove.type = "button"; remove.dataset.operation = "delete-share"; remove.append(trash, node("span", "取消分享"))
        buttons.push(button, remove)
      }
      return { name: entry.name, buttons, execute: kind => execute(kind, { view, path, share, name: entry.name, directory: directoryPage, user: accountUser, selected: [entry], entries: tableEntries.filter(item => !item.portal) }) }
    }
    if (!driveToken() || !accountUser) return
    selected.clear(); selected.add(entry.target); updateSelection()
    const kinds = ["rename", "move", "copy", "delete", "share", "link", "download"]
    const buttons = kinds.flatMap(kind => {
      const button = document.querySelector<HTMLButtonElement>(`[data-drive-operation-groups] [data-operation="${kind}"]`)
      return button ? [button] : []
    })
    if (entry.directory && accountUser.role === 2) {
      const button = node("button", "", "drive-operation-action is-applicable"), icon = node("span", "", "drive-operation-icon")
      icon.setAttribute("aria-hidden", "true"); icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h3m-3 5h8m-2-5h2"/></svg>'
      button.type = "button"; button.dataset.operation = "edit-meta"; button.append(icon, node("span", "编辑元信息")); buttons.unshift(button)
    }
    return { name: entry.name, buttons, execute: kind => execute(kind, {
      view, path, share, name: path.split("/").filter(Boolean).at(-1) || caption,
      directory: directoryPage, user: accountUser, selected: [entry], entries: tableEntries.filter(item => !item.portal),
    }) }
  })
  const listRow = (entry: ListEntry) => {
    const row = node("tr", "", "drive-row"), selection = node("td", "", "drive-select-cell")
    row.dataset.driveEntry = entry.target
    if (!entry.portal) {
      const checkbox = node("input"); checkbox.type = "checkbox"; checkbox.dataset.entry = entry.target
      checkbox.setAttribute("aria-label", `选择 ${entry.name}`);selection.append(checkbox)
    }
    const kind = node("td", "", "drive-kind-cell"), icon = entry.portal ? fileIcon("space") : entry.shared ? fileIcon("share") : fileIconForName(entry.name,entry.directory)
    icon.removeAttribute("aria-hidden"); icon.setAttribute("role", "img"); icon.setAttribute("aria-label", entry.portal ? "管理员空间" : entry.shared ? "分享" : entry.directory ? "文件夹" : "文件")
    kind.append(icon)
    const name = node("td", "", "drive-name-cell"), link = node("a", "", "internal drive-file-open")
    link.href = entry.target; link.title = entry.name; link.dataset.noPopover = "true"; link.dataset.driveHover = "true"
    const nameContent = node("div", "", "drive-entry-name")
    if (entry.protectedShare) { const mark = node("span", "", "encrypted-mark"); mark.innerHTML = encryptedIcon; mark.setAttribute("role", "img"); mark.setAttribute("aria-label", "需要提取码"); nameContent.append(mark) }
    link.append(node("span", entry.displayName || entry.name, "drive-file-name")); nameContent.append(link); name.append(nameContent)
    const tagCell = node("td", "", "drive-tags-cell")
    if (entry.tags?.length) {
      const tags = node("ul", "", "tags directory-tags")
      tags.title = entry.tags.map(tag => `#${tag}`).join(" · ")
      for (const tag of entry.tags.slice(0, 1)) {
        const item = node("li"), tagLink = node("a", tag, "internal tag-link")
        tagLink.href = tagHref(slugTag(tag)); tagLink.dataset.noPopover = "true"
        item.append(tagLink); tags.append(item)
      }
      if (entry.tags.length > 1) { const more = node("li"); more.append(node("span", `+${entry.tags.length - 1}`, "directory-tags-more")); tags.append(more) }
      tagCell.append(tags)
    }
    const sizeText = entry.directory || entry.size === undefined ? "—" : driveSize(entry.size)
    const size = node("td", sizeText, "drive-size-cell"), modified = node("td", "—", "drive-modified-cell")
    const date = new Date(entry.modified)
    if (Number.isFinite(date.getTime())) {
      const time = node("time")
      time.append(node("span",date.toLocaleString(modifiedMeta.dataset.locale || "zh-CN", {timeZone:SITE_DATE_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}),"directory-date-full"),node("span",formatDirectoryDate(date,modifiedMeta.dataset.locale || "zh-CN"),"directory-date-compact"))
      time.dateTime = date.toISOString(); time.title = formatDateWithSeconds(date, modifiedMeta.dataset.locale, true)
      modified.replaceChildren(time)
    }
    row.append(selection, kind, name, tagCell, size, modified)
    return row
  }
  const renderFiles = (append = false) => {
    if (!append) { thumbnailController.abort(); thumbnailController = new AbortController() }
    const imageSignal = AbortSignal.any([lifecycle.signal, thumbnailController.signal])
    const entries: ListEntry[] = files.filter(file => !mediaEnabled || file.is_dir || !isMediaSidecar(file.name)).map(file => {
        const child = joinDrivePath(path, file.name)
        drivePathKinds.set(drivePathKey(view, share, child), file.is_dir)
        return { name: file.name, alias: aliases[child], displayName: aliases[child], target: href(child, file.is_dir), modified: file.modified, created: file.created, size: file.size, sign: file.sign, thumb: file.thumb, directory: file.is_dir, media: mediaFiles.get(file.name) }
      })
    entries.sort((a, b) => {
      // Keep folders together; requested columns then order each group.
      const group = Number(b.directory) - Number(a.directory)
      if (group) return group
      for (const { key, direction } of sortColumns) {
        const result = key === "size" ? (a.size ?? 0) - (b.size ?? 0)
          : key === "modified" ? (Date.parse(a.modified) || 0) - (Date.parse(b.modified) || 0)
          : a.name.localeCompare(b.name, "zh-CN", { numeric: true })
        if (result) return direction * result
      }
      return a.name.localeCompare(b.name, "zh-CN", { numeric: true })
    })
    if (view === "guest" && path === "/") {
      entries.unshift(...sharedEntries.filter((entry):entry is Extract<DriveEntry,{kind:"share"}>=>entry.kind==='share').map(entry=>({name:entry.id,target:driveEntryHref(entry),modified:"",directory:false,shared:true,tags:entry.tags,protectedShare:entry.protected,jellyfin:entry.jellyfin===true,order:entry.order??100})))
      if(driveToken())entries.unshift({name:"空间",target:driveHref("storage"),modified:"",directory:true,portal:true})
    }
    root.querySelector(".drive-file-table")!.classList.toggle("has-directory-tags", entries.some(entry => entry.tags?.length))
    tableEntries = entries
    const known = new Set(entries.filter(entry=>!entry.portal).map(entry => entry.target))
    for (const key of selected) if (!known.has(key)) selected.delete(key)
    const displayed = imageView && !mediaEnabled ? entries.filter(entry => entry.directory || entry.shared || isDriveImageEntry(entry)) : entries
    total = displayed.length; page = Math.min(page, Math.max(1, Math.ceil(total / 50)))
    const from = append ? visibleEntries.length : 0
    visibleEntries = displayed.slice(0, page * 50)
    const addedEntries = visibleEntries.slice(from)
    const mediaGallery = mediaEnabled && Boolean(currentMedia || mediaFiles.size)
    const gallery = mediaEnabled ? mediaGallery : imageView
    root.querySelector<HTMLTableElement>(".drive-file-table")!.hidden = gallery
    get("images").hidden = !gallery
    imageSelectAll.closest("label")!.hidden = mediaEnabled
    if (append) { if (!gallery) list.append(...addedEntries.map(listRow)) }
    else list.replaceChildren(...(gallery ? [] : addedEntries.map(listRow)))
    if (mediaGallery) renderDriveMedia(get("image-items"), addedEntries, imageSignal, append)
    else if (imageView && !mediaEnabled) {
      let imageAccount: Promise<DriveUser> | undefined
      renderDriveImages(get("image-items"), addedEntries, {
        append, signal: imageSignal, hasImages: entries.some(isDriveImageEntry),
        directUrl: async item => {
          const entry = item as ListEntry
          if (view !== "share" && !user) {
            imageAccount ??= readAuthorizedDriveUser(imageSignal)
            const value = await imageAccount; imageSignal.throwIfAborted(); user = value
          }
          return fileUrl({ name: entry.name, is_dir: false, size: entry.size || 0, modified: entry.modified, sign: entry.sign }, driveRoute(new URL(entry.target, location.origin)).path, imageSignal)
        },
      })
    } else get("image-items").replaceChildren()
    get("count").textContent = imageView && !mediaEnabled ? `共 ${entries.length} 项 · ${entries.filter(isDriveImageEntry).length} 张图片` : `共 ${total} 项`
    get("pagination").hidden = visibleEntries.length >= total
    paging.setEnabled(!loading && visibleEntries.length < total)
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-drive-sort]")) {
      const index = sortColumns.findIndex(column => column.key === button.dataset.driveSort)
      const column = sortColumns[index]
      const header = button.closest("th")!
      header.removeAttribute("aria-sort")
      if (index === 0) header.setAttribute("aria-sort", column.direction === 1 ? "ascending" : "descending")
      button.classList.toggle("is-sorted", index >= 0)
      button.querySelector<HTMLElement>(".drive-sort-indicator")!.textContent = column ? `${column.direction === 1 ? "↑" : "↓"}${sortColumns.length > 1 ? index + 1 : ""}` : "↕"
    }
    updateSelection()
  }
  for (const checkbox of [selectAll, imageSelectAll]) listen(checkbox, "change", () => {
    for (const entry of visibleEntries.filter(entry=>!entry.portal)) { if (checkbox.checked) selected.add(entry.target); else selected.delete(entry.target) }
    updateSelection()
  })
  const changeSelection = (event: Event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.dataset.entry) return
    if (input.checked) selected.add(input.dataset.entry); else selected.delete(input.dataset.entry)
    updateSelection()
  }
  listen(list, "change", changeSelection)
  listen(get("images"), "change", changeSelection)
  listen(document,"drive-directory-unlocked",()=>{if(view==="guest"&&path==="/")renderFiles()})
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-drive-sort]")) listen(button, "click", event => {
    if (loading) return
    const key = button.dataset.driveSort as SortKey, old = sortColumns.find(column => column.key === key)
    const column = { key, direction: old ? -old.direction : key === "modified" || key === "size" ? -1 : 1 }
    sortColumns = (event as MouseEvent).shiftKey
      ? old ? sortColumns.map(item => item.key === key ? column : item) : [...sortColumns, column]
      : [column]
    page = 1; renderFiles()
  })
  const filePreview = setupDrivePreview(previewBody, lifecycle.signal)
  const renderFile = async (meta: DriveFile, signal: AbortSignal) => {
    get("listing").hidden = true; list.hidden = true; get("pagination").hidden = true; get("preview").hidden = false
    previewBody.setAttribute("aria-busy", "true")
    previewBody.replaceChildren()
    filePreview.prepare(meta)
    const link = await fileUrl(meta, path, signal)
    if (signal.aborted) return
    await filePreview.load(meta, link, { view, requestPath: requestPath(path), password: password(), user, mediaShare: mediaEnabled, cover: currentMedia?.type === "Movie" ? currentMedia.backdrop || "" : currentMedia?.image }, signal)
  }

  const load = async (refresh = false): Promise<boolean> => {

    filePreview.clear(directoryPage === false ? { name: path.split("/").filter(Boolean).at(-1) || shareRootName, is_dir: false, size: 0, modified: "" } : undefined)
    closeContextMenu(); stopMedia(); thumbnailController.abort(); get("image-items").replaceChildren()
    controller.abort(); controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, lifecycle.signal]), startedToken = driveToken()
    currentFileSize = undefined
    if (view === "share") mediaNamesReady = false
    mediaProgramTitle = undefined; mediaSeasonTitle = undefined
    mediaEpisodes = []; mediaCollections = []; currentMedia = undefined; mediaSourceName = undefined; collapseMovieParent = false; mediaFiles.clear(); collapsedSeasons.clear(); renderMediaSummary(mediaSummary, undefined, mediaOverview)
    const finishLoading = beginDriveLoading(root, signal)
    if (refresh && view === "guest" && path === "/") ownSharesAccount = ""
    loading = true; writable = false; account(); list.inert = true; list.setAttribute("aria-busy", "true")
    if (get("auth").hidden && get("unlock").hidden && get("content").hidden) show("boot")
    message.classList.remove("is-error"); message.textContent = ""
    try {
      if (view === "share") {
        const entries = await fetchDriveEntries()
        if (signal.aborted) return false
        const entry = entries.find(entry => entry.kind === "share" && entry.id === share)
        if (!entry) throw new DriveError("未找到分享", 404)
        sharedAt=entry.kind==='share'?entry.sharedAt||'':''
        setModified('')
        mediaEnabled = entry.kind === "share" && entry.jellyfin === true
        root.classList.toggle("is-media-view", mediaEnabled)
        mediaModePending = false; root.removeAttribute("data-share-mode-pending")
        account()
        if (mediaEnabled) {
          renderShareTags([])
          if (shareComments) shareComments.hidden = true
          root.closest(".center")!.classList.remove("has-share-comments")
        }
        mediaNamesReady = false
        if (path === "/" && entry.kind === "share") renderShareTags(entry.tags || [])
      }
      if (view === "storage") {
        await syncShareAdminSession()
        signal.throwIfAborted()
        user = accountUser = await requireDriveUser(signal)
        // A cold page load parses its URL before /me is available. Reparse once
        // the account root is known, before passing any path to OpenList APIs.
        const accountRoute = driveRoute(url)
        if (!accountRoute.valid) throw new DriveError("目录不在当前账号的空间内", 404)
        if (path !== accountRoute.path) {
          path = accountRoute.path
          viewPreferenceKey = `quartz-drive-list-view:${drivePathKey(view, share, path)}`
          try { imageView = !isDriveImageViewDisabled(view, path) && localStorage.getItem(viewPreferenceKey) === "images" } catch {}
        }
        account()
      }
      if (signal.aborted) return false
      if(view==='guest'&&path==='/'){
        const [data,entries]=await Promise.all([readGuestFiles('/',refresh),fetchDriveEntries()])
        if(signal.aborted)return false
        sharedEntries=entries;files=data.content||[];directoryPage=true;writable=Boolean(data.write)
        get('context').textContent='';title('Share');setModified('');pathLinks()
        renderDriveMetadata(get('header'),data.header);renderDriveMetadata(get('readme'),data.readme)
        get('listing').hidden=false;get('preview').hidden=true;list.hidden=false
        renderFiles();show('content');account();return true
      }
      const [meta, shareAliases] = await Promise.all([
        driveRequest<DriveFile & { header?: string; readme?: string }>("fs/get", { path: requestPath(path), password: password() }, requestOptions(signal)),
        view === "share" ? fetchDriveAliases(share, signal, path).catch(() => ({})) : Promise.resolve({}),
      ])
      aliases = shareAliases
      if (signal.aborted) return false
      if (view === "share") {
        // fs/get has validated access. Persist it before media/preview loading,
        // which may navigate away, fail or remain pending independently.
        const code = password()
        if (code) rememberDriveShareCode(share, code)
        shareUnlocked = true; setProtected(driveShareProtected(share))
      }
      directoryPage = meta.is_dir
      if (mediaEnabled) {
        mediaSourceName = meta.name
        if (!heading.hasAttribute("data-drive-title-retained")) {heading.style.visibility = "hidden";modifiedMeta.style.visibility="hidden"}
        try {
          const media = await fetchDriveMedia(requestPath(path), password(), signal, refresh)
          if (signal.aborted) return false
          currentMedia = media.current
          const trail = [...media.breadcrumbs || [], { path, media: media.current }]
          mediaProgramTitle = trail.find(crumb => crumb.media?.type === "Series")?.media?.title
          mediaSeasonTitle = trail.find(crumb => crumb.media?.type === "Season")?.media?.title
          for (let index = 1; index < trail.length; index++) {
            const season = trail[index], series = trail[index - 1]
            if (season.media?.type === "Season" && series.media?.type === "Series" && series.media.seasonCount === 1) {
              collapsedSeasons.set(season.path, { seriesPath: series.path, title: series.media.title })
            }
          }
          if (!meta.is_dir && currentMedia?.type === "Episode") {
            const parent = path.slice(0, path.lastIndexOf("/")) || "/"
            void fetchDriveMedia(requestPath(parent), password(), signal, refresh).then(season => {
              if (signal.aborted) return
              mediaProgramTitle ||= season.breadcrumbs?.find(crumb => crumb.media?.type === "Series")?.media?.title
              mediaSeasonTitle ||= season.current?.type === "Season" ? season.current.title : undefined
              mediaEpisodes = season.entries.filter(entry => entry.media?.type === "Episode").map(entry => ({
                name: entry.name, title: entry.media!.title, number: entry.media!.index,
                href: href(joinDrivePath(parent, entry.name), false), current: entry.name === meta.name,
              })).sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity) || a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
              updateOperations()
            }).catch(() => { if (!signal.aborted) { mediaEpisodes = [{ name: meta.name, title: currentMedia?.title || meta.name, number: currentMedia?.index, href: href(path, false), current: true }]; updateOperations() } })
          }
          collapseMovieParent = media.collapseMovieParent === true
          for (const crumb of media.breadcrumbs || []) if (crumb.media) mediaTitles.set(crumb.path, crumb.media.title)
          mediaFiles = new Map(media.entries.filter(entry => entry.media).map(entry => [entry.name, entry.media!]))
          if (currentMedia) mediaTitles.set(path, currentMedia.title)
          for (const entry of media.entries) if (entry.media) mediaTitles.set(joinDrivePath(path, entry.name), entry.media.title)
          if (view === "share" && currentMedia?.type === "Movie") {
            if (meta.is_dir) rememberMovieTreeTarget(share, path, !media.autoFile, media.autoFile ? joinDrivePath(path, media.autoFile) : path)
            else if (media.collapseMovieParent) rememberMovieTreeTarget(share, path.slice(0, path.lastIndexOf("/")) || "/", false, path)
          }
          const autoTarget = media.autoDirectory || media.autoFile
          if (meta.is_dir && autoTarget) {
            const target = new URL(href(joinDrivePath(path, autoTarget), Boolean(media.autoDirectory)), location.origin)
            if (password()) rememberDriveShareCode(share, password())
            history.replaceState(history.state, "", target.pathname)
            await window.spaNavigate(target, true)
            return true
          }
        } catch (error) { if (signal.aborted) return false; console.warn("媒体信息暂不可用，使用原文件名", error) }
        if(currentMedia){
          void fetchDriveCollections(requestPath(path),password(),currentMedia.collectionScope||path,signal,refresh).then(groups=>{
            if(signal.aborted)return
            mediaCollections=groups;updateOperations()
          }).catch(()=>{})
        }
        if (meta.is_dir) get("listing").before(mediaOverview); else get("preview").after(mediaOverview)
  const inlineEpisodes = node("div"); inlineEpisodes.dataset.driveInlineEpisodes = ""; mediaOverview.after(inlineEpisodes)
        renderMediaSummary(mediaSummary, currentMedia, mediaOverview, { reserveOverview: meta.is_dir, signal })
        mediaNamesReady = true
      }
      mediaNamesReady = true
      if(view==='share')setProtected(driveShareProtected(share))
      const showMetadata = view !== "share" || path === "/" && meta.is_dir
      currentFileSize = meta.is_dir ? undefined : meta.size
      account()
      const canonical = driveHref(view, path, share, meta.is_dir)
      if (location.pathname !== canonical) history.replaceState(history.state, "", canonical + location.search + location.hash)
      drivePathKinds.set(drivePathKey(view, share, path), meta.is_dir)
      title(path === "/" && view === "guest" ? "Share" : path === "/" && view === "storage" ? "空间" : meta.name || path.split("/").pop() || caption)
      if (view === "share" && path === "/") shareRootName = share
      setModified(path === "/" && ["guest", "storage"].includes(view) ? "" : meta.modified, reserveModified)
      pathLinks()
      if (view === "share" && path === "/") await setupSharePage(signal).catch(() => { if (!signal.aborted) console.warn("分享评论暂时不可用") })
      if (!meta.is_dir) {
        renderDriveMetadata(get("header"), showMetadata ? meta.header : undefined); renderDriveMetadata(get("readme"), showMetadata ? meta.readme : undefined)
        show("content"); await renderFile(meta, signal); return !signal.aborted
      }
      type Listing = { content: DriveFile[] | null; total: number; write: boolean; header?: string; readme?: string }
      let data: Listing
      if (view === "storage" && path === "/") {
        const dirs = await driveRequest<{ name: string; modified: string }[]>("fs/dirs", { path: "/", password: password() }, { signal })
        data = { content: dirs.map(item => ({ ...item, is_dir: true, size: 0 })), total: dirs.length, write: false }
        get("context").textContent = ""
      } else data = await driveRequest<Listing>("fs/list", { path: requestPath(path), password: password(), page: 1, per_page: 0, refresh }, requestOptions(signal))
      if (signal.aborted) return false
      files = data.content || []; total = data.total; writable = Boolean(data.write)
      renderDriveMetadata(get("header"), showMetadata ? data.header ?? meta.header : undefined); renderDriveMetadata(get("readme"), showMetadata ? data.readme ?? meta.readme : undefined)
      get("listing").hidden = false; get("preview").hidden = true; list.hidden = false
      renderFiles(); show("content"); return true
    } catch (error) {
      if (signal.aborted) return false
      mediaNamesReady = true; mediaModePending = false
      previewBody.setAttribute("aria-busy", "false")
      const text = error instanceof Error ? error.message : "读取失败，请重试"
      if (error instanceof DriveError && (error.code === 404 || error.code === 410 ||
        /(?:not found|does not exist|doesn't exist|文件不存在|目录不存在|路径不存在|分享不存在)/i.test(text))) {
        notFound(); return false
      } else if (error instanceof DriveError && error.code === 401 && view === "storage") {
        if (startedToken && driveToken() === startedToken) setDriveToken("")
        user = accountUser = undefined
        if (path !== "/") { location.replace(driveHref("storage")); return false }
        directoryPage = true; title("空间"); account(); show("auth")
        startedToken && showPasswordToast("登录已失效，请通过星枢重新登录",true)
      } else if (error instanceof DriveError && error.code === 403 && /password|密码|share code|提取码|no permission/i.test(text)) {
        if (view === "share" && path === "/") {
          try { const entry = (await fetchDriveEntries()).find(entry => entry.kind === "share" && entry.id === share); if (entry?.kind === "share" && !signal.aborted) { shareRootName = entry.id; title(shareRootName) } } catch {}
        }
        if (signal.aborted) return false
        if (directoryPage === undefined) { directoryPage = true; title(path.split("/").filter(Boolean).at(-1) || shareRootName) }
        shareUnlocked = false; setProtected(true)
        if (!modifiedTime.dateTime) setModified("", true)
        mediaNamesReady = true
        pathLinks(); show("unlock"); get("unlock-title").textContent = view === "share" ? "此分享需要提取码" : "此内容需要访问密码"
        const input = unlockForm.querySelector<HTMLInputElement>("input")!
        const prompt = view === "share" ? "输入提取码" : "输入密码"
        input.placeholder = prompt; input.setAttribute("aria-label", prompt)
        get("unlock-error").textContent = ""
        const attemptedPassword = password()
        if (view === "share") forgetDriveShareCode(share)
        if (attemptedPassword) showPasswordToast(view === "share" ? "提取码错误，请重试。" : "密码错误，请重试。", true)
      } else {
        show("content"); get("count").textContent = ""; get("pagination").hidden = true
        if (!get("preview").hidden) previewBody.replaceChildren(node("p", text, "drive-empty"))
        else { get("listing").hidden = false; list.hidden = false; const row = node("tr"), cell = node("td", text, "drive-list-empty"); cell.colSpan = 5; row.append(cell); list.replaceChildren(row) }
        message.textContent = text; message.classList.add("is-error")
      }
      return false
    } finally {
      finishLoading()

      if (!signal.aborted) { loading = false; paging.setEnabled(!get("listing").hidden && !get("pagination").hidden && visibleEntries.length < total); list.inert = false; list.setAttribute("aria-busy", "false"); if (!message.classList.contains("is-error")) message.textContent = ""; account() }
    }
  }
  const unlockInput = unlockForm.querySelector<HTMLInputElement>("input")!
  const unlockSubmit = unlockForm.querySelector<HTMLButtonElement>("button[type=submit]")!
  const visibility = unlockForm.querySelector<HTMLButtonElement>(".password-visibility-toggle")!
  const updateUnlockSubmit = () => { unlockSubmit.disabled = unlockInput.disabled || unlockInput.value.length === 0 }
  listen(unlockInput, "input", updateUnlockSubmit)
  listen(visibility, "click", () => {
    const plain = unlockInput.classList.toggle("show-plain"), label = plain ? "隐藏密码" : "显示密码"
    visibility.setAttribute("aria-label", label); visibility.title = label; visibility.setAttribute("aria-pressed", String(plain))
    visibility.querySelector("svg")!.innerHTML = plain
      ? '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.6 6.6A19 19 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.6"/>'
      : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>'
  })
  unlockInput.value = parameterPassword ?? ""
  updateUnlockSubmit()
  listen(unlockForm, "submit", async event => {
    event.preventDefault(); const value = String(new FormData(unlockForm).get("password") || ""), controls = [...unlockForm.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input,button")]
    drivePasswords.set(drivePasswordKey(view, share, path), value); controls.forEach(input => input.disabled = true); unlockForm.querySelector("button[type=submit]")!.setAttribute("aria-busy", "true"); unlockForm.setAttribute("aria-busy", "true"); get("unlock-error").textContent = ""
    try { if (await load()) { unlockForm.reset(); if (view !== "share") document.dispatchEvent(new CustomEvent("drive-directory-unlocked")) } }
    finally { controls.forEach(input => input.disabled = false); unlockForm.querySelector("button[type=submit]")!.removeAttribute("aria-busy"); unlockForm.removeAttribute("aria-busy"); updateUnlockSubmit() }
  })
  window.addCleanup(() => { lifecycle.abort(); controller.abort(); thumbnailController.abort(); stopMedia(); previewBody.replaceChildren() })
  setProtected(view === "share" && driveShareProtected(share))
  setModified("", reserveModified)
  if (view === "share" && !breadcrumbs.hasAttribute("data-drive-breadcrumb-retained")) breadcrumbs.removeAttribute("data-drive-breadcrumb-ready")
  title(view === "share" ? "" : path.split("/").filter(Boolean).at(-1) || caption); pathLinks(); account()
  // load() remembers a share code once fs/get has actually validated it.
  void load()
  if (driveToken() && view !== "storage") {
    const token = driveToken()
    void requireDriveUser(lifecycle.signal).then(value => { if (!lifecycle.signal.aborted && driveToken() === token) { accountUser = value; account() } }).catch(() => { if (!lifecycle.signal.aborted && driveToken() === token) { setDriveToken(""); accountUser = undefined; account() } })
  }
  if (view === "share") void fetchDriveEntries().then(entries => {
    if (lifecycle.signal.aborted) return
    const entry = entries.find(entry => entry.kind === "share" && entry.id === share)
    if (entry?.kind === "share") {
      setProtected(entry.protected); if (entry.protected && !modifiedTime.dateTime) setModified("", true); shareRootName = entry.id
      if (path === "/" && (!entry.jellyfin || currentMedia || entry.protected && !password())) title(shareRootName)
      pathLinks()
    } else if (path === "/") title("分享文件")
  }).catch(() => { if (!lifecycle.signal.aborted && path === "/" && heading.getAttribute("aria-busy") === "true") title("分享文件") })
})
