import { beginDriveLoading } from "./driveLoading"
import { driveRequest, DriveError, type DriveUser } from "./driveClient"
import { fileIcon, fileIconForName, node } from "./driveUi"
import { driveSize, type DriveFile } from "./openlistShared"
type ArchiveEntry = DriveFile & { children?: ArchiveEntry[] }
type ArchiveMeta = { content: ArchiveEntry[] | null; encrypted: boolean; comment: string; sign?: string }
const archivePasswords = new Map<string, string>()
const cachedArchivePassword = (key: string) => {
  try { return sessionStorage.getItem(key) || archivePasswords.get(key) || "" } catch { return archivePasswords.get(key) || "" }
}
const cacheArchivePassword = (key: string, value: string) => {
  if (value) archivePasswords.set(key, value); else archivePasswords.delete(key)
  try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key) } catch { /* Keep this tab's in-memory fallback. */ }
}
export type PreviewAccess = { view: string; requestPath: string; password: string; user?: DriveUser; mediaShare?: boolean; cover?: string }
export async function renderDriveArchive(root: HTMLElement, direct: string, access: PreviewAccess, signal: AbortSignal, open: (file: DriveFile, url: string, directory: string) => void, initialDirectory = "/") {
  root.classList.add("drive-archive-preview")
  const options = { anonymous: access.view === "share" || access.view === "guest", signal }
  const cacheKey = `drive-archive-password:${JSON.stringify([access.view, access.requestPath, access.view === "storage" ? [access.user?.username, access.user?.base_path] : null])}`
  let pass = cachedArchivePassword(cacheKey), meta: ArchiveMeta | undefined
  const navigate = (path: string) => { void list(path).catch(error => { if (!signal.aborted) root.replaceChildren(node("p", error instanceof Error ? error.message : "读取压缩包失败", "drive-preview-note")) }) }
  const list = async (path = "/") => {
    const finishLoading = beginDriveLoading(root, signal)
    root.setAttribute("aria-busy", "true")
    root.replaceChildren()
    try {
      const args = { path: access.requestPath, password: access.password, archive_pass: pass }
      meta ??= await driveRequest<ArchiveMeta>("fs/archive/meta", args, options)
      if (signal.aborted) return
      if (meta.encrypted && !pass) throw new DriveError("请输入压缩包密码", 202)
      let content = meta.content
      if (content) for (const part of path.split("/").filter(Boolean)) content = content?.find(entry => entry.name === part)?.children || []
      else content = (await driveRequest<{ content: ArchiveEntry[] | null }>("fs/archive/list", { ...args, inner_path: path, page: 1, per_page: 0, refresh: false }, options)).content || []
      if (signal.aborted) return
      if (pass) cacheArchivePassword(cacheKey, pass)
      root.replaceChildren()
      const header = node("header", "", "drive-archive-header"), nav = node("nav", "", "drive-archive-path"), crumbs = path.split("/").filter(Boolean)
      nav.setAttribute("aria-label", "压缩包内路径")
      const crumb = (label: string, target: string, current = false) => {
        if (nav.childElementCount) { const separator = node("span", "/", "drive-archive-separator"); separator.setAttribute("aria-hidden", "true"); nav.append(separator) }
        const item = current ? node("span", label, "drive-archive-current") : node("button", label)
        if (item instanceof HTMLButtonElement) { item.type = "button"; item.onclick = () => navigate(target) }
        else item.setAttribute("aria-current", "location")
        if (target === "/") item.prepend(fileIcon("archive"))
        nav.append(item)
      }
      crumb("压缩包", "/", !crumbs.length)
      crumbs.forEach((name, index) => crumb(name, `/${crumbs.slice(0, index + 1).join("/")}`, index === crumbs.length - 1))
      const folders = content.filter(entry => entry.is_dir).length
      header.append(nav, node("span", `${folders} 个文件夹 · ${content.length - folders} 个文件`, "drive-archive-count")); root.append(header)
      if (meta.comment) root.append(node("p", meta.comment, "drive-archive-comment"))
      const columns = node("div", "", "drive-archive-columns"); columns.setAttribute("aria-hidden", "true"); columns.append(node("span", "名称"), node("span", "大小")); root.append(columns)
      const items = node("div", "", "drive-archive-list"); items.setAttribute("role", "list")
      for (const entry of content.sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name, "zh-CN", { numeric: true }))) {
        const row = node("div", "", "drive-archive-row"), button = node("button", entry.name), inner = `${path.replace(/\/$/, "")}/${entry.name}`
        row.setAttribute("role", "listitem")
        button.type = "button"; button.title = entry.name
        button.onclick = () => {
          if (entry.is_dir) { navigate(inner); return }
          const url = new URL(direct)
          url.pathname = access.view === "share" ? url.pathname.replace(/^\/sd\//, "/sad/") : url.pathname.replace(/^\/d\//, "/ae/")
          if (meta?.sign && access.view !== "share") url.searchParams.set("sign", meta.sign)
          url.searchParams.set("inner", inner); if (pass) url.searchParams.set("pass", pass)
          open(entry, url.href, path)
        }
        row.append(fileIconForName(entry.name,entry.is_dir), button, node("span", entry.is_dir ? "—" : driveSize(entry.size), "drive-archive-size"))
        items.append(row)
      }
      root.append(items)
      if (!content.length) root.append(node("p", "此目录为空", "drive-archive-empty"))
    } catch (error) {
      if (signal.aborted) return
      if (error instanceof DriveError && (error.code === 202 || /password|密码/i.test(error.message) || error.code === 403 && meta?.encrypted)) {
        const wrongPassword = Boolean(pass)
        cacheArchivePassword(cacheKey, ""); pass = ""
        const gate = node("section", "", "drive-archive-gate"), form = node("form", "", "drive-archive-password"), input = node("input"), submit = node("button")
        const field = node("div", "", "password-field"), visibility = node("button", "", "password-visibility-toggle")
        visibility.type = "button"; visibility.setAttribute("aria-label", "显示密码"); visibility.title = "显示密码"; visibility.setAttribute("aria-pressed", "false")
        const eye = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>'
        const eyeOff = '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.6 6.6A19 19 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.6"/>'
        visibility.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${eye}</svg>`
        visibility.onclick = () => {
          const plain = input.type === "password", label = plain ? "隐藏密码" : "显示密码"
          input.type = plain ? "text" : "password"
          visibility.setAttribute("aria-label", label); visibility.title = label; visibility.setAttribute("aria-pressed", String(plain))
          visibility.querySelector("svg")!.innerHTML = plain ? eyeOff : eye
        }
        input.type = "password"; input.placeholder = "输入压缩包密码"; input.setAttribute("aria-label", "压缩包密码"); input.required = true
        submit.type = "submit"; submit.disabled = true; submit.setAttribute("aria-label", "解锁压缩包"); submit.title = "解锁压缩包"
        submit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>'
        input.oninput = () => { submit.disabled = !input.value }
        field.append(input, visibility); form.append(field, submit)
        form.onsubmit = event => { event.preventDefault(); if (!input.value) return; pass = input.value; meta = undefined; navigate(path) }
        gate.append(fileIcon("archive"), node("strong", "此压缩包需要密码"), form)
        if (wrongPassword) { const note = node("p", "密码错误，请重试", "drive-archive-error"); note.setAttribute("role", "alert"); gate.append(note) }
        root.replaceChildren(gate)
      } else throw error
    } finally {
      root.setAttribute("aria-busy", "false"); finishLoading()
    }
  }
  await list(initialDirectory)
}
