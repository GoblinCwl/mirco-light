import {isDriveImageEntry} from './driveImageView'
import { setupDriveEpisodes, type DriveEpisode } from "./driveEpisodes"
import { absoluteStoragePath } from "../../util/driveStoragePaths"
import type { ActionContext, ActionEntry } from "./driveActions"
import { driveRoute, type DriveUser, type DriveView } from "./driveClient"
import { isDriveImageViewDisabled, isSpaceRootOperationDisabled } from "./driveOperationRules"
import { fileIcon, fileIconForName, node } from "./driveUi"
import { DRIVE_ORIGIN, driveSize } from "./openlistShared"
import { showSiteDialog, closeSiteDialog } from "./siteDialog"
import { readDriveShareCode } from "./driveCredentials"
import { setupDriveCollections } from './driveCollections'
import type { MediaCollection } from './driveMediaView'

export type DriveOperationsState = {
  mediaCollections?: MediaCollection[]
  view: DriveView; name: string; directory: boolean | undefined; loading: boolean; imageView: boolean
  fileSize?: number; mediaEpisode?: boolean; mediaSeason?: number; mediaProgramTitle?: string; mediaSeasonTitle?: string; mediaEpisodes?: DriveEpisode[]; mediaView?: boolean; mediaPoster?: string; mediaPosterKey?: string; mediaPosterScope?: string; mediaTitle?: string; mediaUrl?: string; mediaTmdbUrl?: string; pendingShare?: boolean; contextPending?: boolean; canManageShare?: boolean; user?: DriveUser; writable: boolean; ready: boolean; selected: ActionEntry[]; entries: ActionEntry[]; path: string; share: string
}
const icons: Record<string, string> = {
  "manage-users": '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  "manage-storages": '<rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01m4-10h6m-6 10h6"/>',
  "manage-meta": '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h3m-3 5h8m-2-5h2"/>',
  "manage-tasks": '<path d="M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  link: '<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  rename: '<path d="m4 16 11-11 4 4L8 20H4v-4Zm9-9 4 4M14 21h7"/>',
  move: '<path d="M4 5h7v14H4V5Zm11 4 4 3-4 3m-5-3h10"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  delete: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  extract: '<path d="M6 3h12v18H6V3Zm6 0v9m-2-6h4m-4 3h4m-2 6v3m-2-2 2 2 2-2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3m-6 7 6 3"/>',
  images: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  files: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  folder: '<path d="M3 7V5h7l2 2h9v14H3V7Zm9 4v6m-3-3h6"/>',
  merge: '<path d="M5 3v4c0 3 7 3 7 6m7-10v4c0 3-7 3-7 6v8m-4-4 4 4 4-4"/>',
  clean: '<path d="m15 3-5 9m-5 0 9 5-4 5-8-5 3-5Zm13 1 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/>',
  batch: '<path d="M4 5h9M4 10h6M4 15h4m4 0 7-7 3 3-7 7h-3v-3ZM4 21h13"/>',
  "edit-share": '<path d="m4 16 11-11 4 4L8 20H4v-4Zm9-9 4 4M14 21h7"/>',
  "delete-share": '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  offline: '<path d="M6 16a4 4 0 0 1 0-8 6 6 0 0 1 11.6-1A4.5 4.5 0 0 1 18 16M12 11v10m-4-4 4 4 4-4"/>',
}
const symbol = (kind: string) => {
  const span = node("span", "", "drive-operation-icon"); span.setAttribute("aria-hidden", "true")
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[kind]}</svg>`
  return span
}

export function setupDriveOperations(signal: AbortSignal, callbacks: { clearSelection: () => void; execute: (kind: string, context: ActionContext) => Promise<void> }) {
  const root = document.querySelector<HTMLElement>("[data-drive-operations]")!
  const get = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-drive-${name}]`)!
  const dialog = get<HTMLDialogElement>("operations-dialog"), launch = get<HTMLButtonElement>("operations-launch")
  // The panel belongs to the new route; retain neither an old scroll offset nor
  // an anchor adjustment from the previous directory's longer action list.
  root.querySelector<HTMLElement>(".drive-operations-inner")!.scrollTop = 0
  dialog.scrollTop = 0
  const episodes = get("episodes")
  const updateEpisodes = setupDriveEpisodes(root, signal)
  const updateCollections = setupDriveCollections(root,signal)
  const compact = window.matchMedia("(max-width: 1199px)")
  const adapt = () => { if (dialog.open) dialog.close(); if (!compact.matches) dialog.setAttribute("open", "") }
  const close = () => { if (compact.matches && dialog.open) void closeSiteDialog(dialog) }
  launch.addEventListener("click", () => { if (!dialog.open) showSiteDialog(dialog); launch.setAttribute("aria-expanded", "true") }, { signal })
  get("operations-close").addEventListener("click", close, { signal })
  dialog.addEventListener("close", () => {if(!dialog.open)launch.setAttribute("aria-expanded", "false")}, { signal })
  dialog.addEventListener("click", event => {
    if (!compact.matches || event.target !== dialog) return
    const box = dialog.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close()
  }, { signal })
  get("operation-clear").addEventListener("click", callbacks.clearSelection, { signal })
  compact.addEventListener("change", adapt); adapt()
  signal.addEventListener("abort", () => { compact.removeEventListener("change", adapt); if (dialog.open) dialog.close() }, { once: true })

  let posterRequest = 0, pendingPoster = ""
  return { update(state: DriveOperationsState) {
    if (signal.aborted) return
    root.hidden = false
    updateCollections(state.mediaCollections,state.share,Boolean(state.mediaView&&!state.contextPending&&!state.pendingShare))
    const retainedEpisodes = Boolean(episodes.hasAttribute("data-drive-episodes-retained") && !episodes.hidden && (state.contextPending || state.mediaEpisode && !state.mediaEpisodes?.length))
    const episodePicker = state.mediaEpisode === true || retainedEpisodes
    const shareManagement=state.view==='guest'&&state.path==='/'&&state.user?.role===2
    const manageShare=shareManagement&&Boolean(state.canManageShare)
    launch.hidden = Boolean((compact.matches && episodePicker || state.mediaView && !episodePicker)&&!manageShare || state.pendingShare && !retainedEpisodes)
    updateEpisodes(episodePicker, state.mediaEpisodes, state.mediaSeason, state.mediaProgramTitle, state.mediaSeasonTitle, state.contextPending)
    const poster = get("media-poster"), image = poster.querySelector("img")!, artwork = poster.querySelector<HTMLElement>(".drive-media-artwork")!
    poster.querySelector<HTMLElement>("figcaption")!.inert = Boolean(state.contextPending)
    const preparingPoster = state.contextPending && (state.mediaView || poster.hasAttribute("data-drive-poster-pending"))
    if (preparingPoster) {
      if (pendingPoster) ++posterRequest
      pendingPoster = ""
      const reuse = poster.dataset.drivePosterReuse === "true" && Boolean(image.getAttribute("src"))
      image.hidden = !reuse
      poster.hidden = !reuse; artwork.hidden = !reuse
      artwork.classList.toggle("is-media-loading", !reuse); artwork.setAttribute("aria-busy", String(!reuse))
    } else {
      const samePoster = Boolean(image.getAttribute("src")) && (image.getAttribute("src") === state.mediaPoster || Boolean(state.mediaPosterKey && poster.dataset.drivePosterKey === state.mediaPosterKey))
      poster.removeAttribute("data-drive-poster-pending")
      delete poster.dataset.drivePosterReuse
      if (state.mediaPosterScope) poster.dataset.drivePosterScope = state.mediaPosterScope
      else delete poster.dataset.drivePosterScope
      for (const [name, url, label] of [["media-link", state.mediaUrl, "Jellyfin"], ["media-tmdb-link", state.mediaTmdbUrl, "TMDB"]] as const) {
        const link = get<HTMLAnchorElement>(name)
        link.hidden = !url
        if (url) link.href = url; else link.removeAttribute("href")
        link.title = url ? `在 ${label} 打开：${state.mediaTitle || "媒体详情"}` : ""
      }
      if (state.mediaPosterKey) poster.dataset.drivePosterKey = state.mediaPosterKey
      else delete poster.dataset.drivePosterKey
      image.alt = state.mediaTitle || "媒体海报"
      poster.hidden = !state.mediaPoster && !state.mediaUrl && !state.mediaTmdbUrl
      if (!state.mediaPoster) {
        ++posterRequest; pendingPoster = ""; image.hidden = true; image.removeAttribute("src")
        artwork.hidden = true; artwork.classList.remove("is-media-loading"); artwork.setAttribute("aria-busy", "false")
      } else if (samePoster) {
        if (pendingPoster) { ++posterRequest; pendingPoster = "" }
        image.hidden = false; artwork.hidden = false; artwork.classList.remove("is-media-loading"); artwork.setAttribute("aria-busy", "false")
      }
      else if (pendingPoster !== state.mediaPoster) {
        const url = state.mediaPoster, request = ++posterRequest, preload = new Image()
        pendingPoster = url
        image.hidden = true; image.removeAttribute("src")
        artwork.hidden = false
        artwork.classList.add("is-media-loading"); artwork.setAttribute("aria-busy", "true")
        preload.referrerPolicy = "no-referrer"
        preload.onload = async () => {
          try { await preload.decode() } catch { /* onload already established a usable image. */ }
          if (signal.aborted || request !== posterRequest) return
          pendingPoster = ""; image.src = url; image.hidden = false
          artwork.classList.remove("is-media-loading"); artwork.setAttribute("aria-busy", "false")
        }
        preload.onerror = () => { if (!signal.aborted && request === posterRequest) { pendingPoster = ""; artwork.classList.remove("is-media-loading"); artwork.setAttribute("aria-busy", "false"); artwork.hidden = image.hidden } }
        preload.src = url
      }
    }
    const signedIn=Boolean(state.user)
    const selected = state.selected, count = selected.length, storage = state.view === "storage", share = state.view === "share"
    const target = count === 1 ? selected[0] : undefined
    const hasTarget = count > 0 || state.directory === false
    const original = (view: DriveView, path: string, id: string) => {
      if (view === "storage" && state.user) path = absoluteStoragePath(path, state.user.base_path || "/")
      const suffix = path.split("/").filter(Boolean).map(encodeURIComponent).join("/")
      const url = new URL(view === "share" ? `${DRIVE_ORIGIN}/@s/${encodeURIComponent(id)}${suffix ? `/${suffix}` : ""}` : `${DRIVE_ORIGIN}/${suffix}`)
      const code = view === "share" ? readDriveShareCode(id) : ""
      if (code) url.searchParams.set("pwd", code)
      return url.href
    }
    const external = (text: string, href: string) => { const link = node("a", text); link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer"; link.title = "在 Drive 原站打开"; return link }
    const context = get("operation-context")
    context.setAttribute("aria-busy", String(Boolean(state.contextPending)))
    context.inert = Boolean(state.contextPending)
    if (state.contextPending) {
      get("operation-clear").hidden = true; context.hidden = false
    } else {
    const currentHref = original(state.view, state.path, state.share)
    get("operation-scope").replaceChildren(node("span", count ? "已选项目" : state.directory === false ? "当前文件" : "当前目录"))
    // Reserve this row even when its label is empty, so selection cannot shift the panel.
    get("operation-scope").parentElement!.hidden = false
    get("operation-clear").hidden = !count
    const caption = count > 1 ? `已选择 ${count} 项` : target?.name || state.name
    const route = target ? driveRoute(new URL(target.target, location.origin)) : undefined
    const name = count > 1 ? node("strong", caption) : external(caption, route ? original(route.view, route.path, route.share) : currentHref)
    get("operation-target").replaceChildren(storage && state.path === "/" && !target && !count ? fileIcon("space") : count > 1 ? fileIcon("other") : target?.shared ? fileIcon("share") : fileIconForName(target?.name || state.name,target ? target.directory : state.directory !== false), name)
    const bytes = selected.reduce((sum, item) => sum + (item.directory ? 0 : item.size || 0), 0)
    get("operation-summary").textContent = count ? `${selected.filter(item => item.directory).length} 个文件夹 · ${selected.filter(item => !item.directory).length} 个文件${bytes ? ` · ${driveSize(bytes)}` : ""}` : state.directory === false ? state.fileSize === undefined ? "—" : driveSize(state.fileSize) : storage ? "空间" : share ? "分享" : "访客空间"
    get("operation-context").hidden = false
    }
    get("operations-launch-label").textContent = episodePicker && !manageShare ? "选集" : count ? `已选 ${count} 项 · 操作` : "操作"
    const launchIcon = episodePicker && !manageShare ? "episodes" : "operations"
    if (launch.dataset.icon !== launchIcon) {
      const svg = launch.querySelector("svg")!
      svg.setAttribute("stroke-linejoin", "round")
      svg.innerHTML = episodePicker && !manageShare
        ? '<rect x="6" y="3" width="15" height="16" rx="2.5"/><path d="M3 7v12a3 3 0 0 0 3 3h11"/><path d="m12 8 5 3-5 3Z" fill="currentColor" stroke="none"/>'
        : '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="var(--light)"/><circle cx="16" cy="12" r="2" fill="var(--light)"/><circle cx="10" cy="18" r="2" fill="var(--light)"/>'
      launch.dataset.icon = launchIcon
    }
    const groups = get("operation-groups"); groups.replaceChildren()
    if (state.mediaView && !manageShare || state.pendingShare) return
    if (storage && !signedIn) return
    // The server remains authoritative for per-user and per-directory permissions.
    const allowed = (bit: number) => storage && Boolean(state.user && (state.user.role === 2 || ((state.user.permission || 0) & (1 << bit)) !== 0))
    const available = state.ready && !state.loading
    const group = (label: string) => {
      const section = document.createElement("section")
      section.className = "drive-operation-group"
      const heading = document.createElement("div"); heading.className = "drive-operation-group-heading"
      heading.append(node("span", label))
      
      section.append(heading)
      const grid = node("div", "", "drive-operation-grid"); section.append(grid); groups.append(section)
      return grid
    }
    const add = (grid: HTMLElement, label: string, kind: string, applicable: boolean, hint = "请先选择文件或文件夹") => {
      const button = node("button", "", "drive-operation-action")
      const blocked = isSpaceRootOperationDisabled(state.view, state.path, kind)
      const enabled = !blocked && applicable && (kind === "link" || kind === "edit-share" || kind === "delete-share" || kind === "manage-meta" || kind === "manage-tasks" || kind === "manage-users" || kind === "manage-storages" || available)
      button.type = "button"; button.disabled = !enabled; button.dataset.operation = kind
      button.classList.toggle("is-applicable", enabled)
      button.title = enabled ? label : blocked ? "空间首页不支持此操作" : state.loading ? "内容正在加载" : hint
      button.addEventListener("click", () => { close(); void callbacks.execute(kind, state) }, { signal })
      button.append(symbol(kind), node("span", label)); grid.append(button)
    }
    if(state.mediaView)return
    const files=group("操作")
    if (state.directory !== false) {
      add(files, state.imageView ? "文件视图" : "图片视图", state.imageView ? "files" : "images", !isDriveImageViewDisabled(state.view, state.path) && (state.imageView || state.entries.some(isDriveImageEntry)), "当前目录没有图片")
      if (state.user?.role===2 && (storage && state.path === "/" || allowed(3) && (state.writable || state.loading))) { add(files, "上传文件", "upload", true); add(files, "新建文件夹", "folder", true) }
      if (state.user?.role===2 && (storage && state.path === "/" || allowed(2))) add(files, "离线下载", "offline", true)
      if (allowed(4) || state.path !== "/" && (allowed(5) || allowed(7))) {
        const tidy = group("整理")
        if (state.path !== "/" && allowed(5)) add(tidy, "聚合移动", "merge", true)
        if (state.path !== "/" && allowed(7)) add(tidy, "移除空文件夹", "clean", true)
        if (allowed(4)) add(tidy, "批量重命名", "batch", state.entries.length > 0, "当前目录没有可重命名的项目")
      }
    }
    {
      add(files, "下载", "download", hasTarget)
      add(files, "复制直链", "link", count > 0)
      if(!signedIn)return
      if(shareManagement){
        add(files,'编辑分享','edit-share',manageShare&&!state.loading,'请选择一个自己创建的分享，不可混选文件')
        add(files,'取消分享','delete-share',manageShare&&!state.loading,'请选择一个自己创建的分享，不可混选文件')
        files.lastElementChild!.classList.add('is-danger')
      }
      if (allowed(5)) add(files, "移动", "move", hasTarget)
      if (allowed(6)) add(files, "复制", "copy", hasTarget)
      if (allowed(4)) add(files, count > 1 ? "批量重命名" : "重命名", "rename", hasTarget)
      if (allowed(13)) add(files, "解压", "extract", Boolean((target && !target.directory || !count && state.directory === false) && /\.(?:zip|rar|7z|tar|gz|tgz|bz2|xz|zst)$/i.test(target?.name || state.name) && count < 2), "仅适用于单个压缩文件")
      if (allowed(14)) add(files, "分享", "share", hasTarget)
      if (allowed(7)) {
        add(files, "删除", "delete", hasTarget)
        files.lastElementChild!.classList.add("is-danger")
      }
    }
    if (storage && state.path === "/" && state.user?.role === 2) {
      const management = group("管理")
      add(management, "用户", "manage-users", true)
      add(management, "存储", "manage-storages", true)
      add(management, "元信息", "manage-meta", true)
      add(management, "任务", "manage-tasks", true)
    }
  } }
}
