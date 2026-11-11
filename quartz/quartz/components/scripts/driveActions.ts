import {requireDriveUser as readAuthorizedDriveUser} from './driveClient'
import {managedShareTarget} from './driveShareManagement'
import {canDownloadDriveEntry} from './driveDownloadPolicy'
import {readDriveShareCode} from './driveCredentials'
import { isSpaceRootOperationDisabled } from "./driveOperationRules"
import { setupDriveUserManager } from "./driveUserManager"
import { setupDriveStorageManager } from "./driveStorageManager"
import { setupDriveMetaManager } from "./driveMetaManager"
import { setupDriveTaskCenter } from "./driveTaskCenter"
import { createDriveHtmlField } from "./driveHtmlField"
import { attachDriveDirectoryPicker } from "./driveDirectoryPicker"
import { setupDriveShareSettings } from "./driveShareSettings"
import { setupDriveSharePaths } from "./driveSharePaths"
import { setupDriveUpload } from "./driveUpload"
import { setupBatchRename } from "./driveBatchRename"
import { setupDriveDownload } from "./driveDownloads"
import { setupOfflineDownload } from "./driveOfflineDownload"
import { setupDriveTaskMonitor } from "./driveTasks"
import { driveHref, drivePassword, driveRequest, driveRoute, driveToken, type DriveUser, type DriveView } from "./driveClient"
import { DRIVE_ORIGIN, driveDownloadUrl, isDriveShareId, joinDrivePath, normalizeDrivePath, type DriveFile } from "./openlistShared"
import { driveActionDialog } from "./driveActionDialog"
import { node } from "./driveUi"
import { showPasswordToast } from "./passwordFeedback"

export type ActionEntry = { protectedShare?:boolean;shared?:boolean; alias?: string; name: string; target: string; directory: boolean; size?: number; created?: string; modified?: string }
export type ActionContext = {
  view: DriveView; path: string; share: string; name: string; directory: boolean | undefined
  user?: DriveUser; selected: ActionEntry[]; entries: ActionEntry[]
}
type ShareDetails = {
  id: string; creator: string; files: string[]; pwd?: string; expires?: string | null; max_accessed?: number
  header?: string; readme?: string; remark?: string; accessed?: number; disabled?: boolean
  order_by?: string; order_direction?: string; extract_folder?: string
}
const defaultShareId = (entry?: ActionEntry) => {
  const name = entry?.name || "share", dot = name.lastIndexOf(".")
  const stem = !entry?.directory && dot > 0 ? name.slice(0, dot) : name
  return Array.from(stem.normalize("NFC").replace(/[^\p{L}\p{N}\p{M}_-]+/gu, "-")).slice(0, 64).join("") || "share"
}
export const parentDrivePath = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/"
export function validDriveName(name: string) {
  if (!name.trim() || name === "." || name === ".." || /[/\\\u0000-\u001f\u007f]/.test(name)) throw new Error("名称不能为空，也不能包含斜杠或控制字符")
  return name
}
export function validateDriveDestination(source: string, destination: string, directory: boolean) {
  if (source === destination || directory && destination.startsWith(source + "/")) throw new Error("目标目录不能是所选项目本身或其子目录")
}

export function setupDriveActions(signal: AbortSignal, changed: (target?: string) => Promise<void>, refresh: () => Promise<unknown>) {
  let active = false
  const monitor = setupDriveTaskMonitor(signal, refresh)
  return async (kind: string, context: ActionContext) => {
    if (active || signal.aborted || isSpaceRootOperationDisabled(context.view, context.path, kind)) return
    if(['edit-share','delete-share'].includes(kind)){
      const target=managedShareTarget(context)
      if(!target||context.user?.role!==2){showPasswordToast('请选择自己创建的分享',true);return}
      context={...context,selected:[target]}
    }
    if(["upload","folder","offline"].includes(kind)&&context.user?.role!==2){showPasswordToast("仅管理员可执行此操作",true);return}
    active = true
    const token = driveToken(), { view, path, share, user } = context
    const targetPath = (entry: ActionEntry) => driveRoute(new URL(entry.target, location.origin)).path
    const targets = context.selected.length ? context.selected : context.directory === false
      ? [{ name: context.name, target: driveHref(view, path, share, false), directory: context.directory !== false }] : []
    const srcDir = context.directory === false ? parentDrivePath(path) : path
    const names = targets.map(item => item.name)
    const checkAccount = () => { if (signal.aborted) throw new DOMException("页面已切换", "AbortError"); if (!token || token !== driveToken()) throw new Error("登录状态已变化，请重新操作") }
    const api = async <T>(route: string, body?: object): Promise<T> => { checkAccount(); return driveRequest<T>(route, body, { token, signal }) }
    let modal: ReturnType<typeof driveActionDialog> | undefined
    const open = (title: string) => {
      modal = driveActionDialog(title, signal)
      modal.dialog.addEventListener("close", () => { active = false }, { once: true })
      return modal
    }
    const commit = async (route: string, body: object, target?: string) => {
      let result: { tasks?: { id: string }[] } | null
      try { result = await api<typeof result>(route, body) }
      catch (error) { await refresh().catch(() => {}); throw error }
      if (result?.tasks?.length) {
        const category = route === "fs/archive/decompress" ? "decompress" : route === "fs/add_offline_download" ? "offline_download" : route.split("/").at(-1)!
        monitor(category, result.tasks, token)
      }
      showPasswordToast(result?.tasks?.length ? `已提交 ${result.tasks.length} 个后台任务，完成后可刷新目录查看` : "操作成功")
      await changed(target)
    }
    const destination = async (ui: ReturnType<typeof open>, initial = srcDir) => {
      const input = ui.field("目标目录", initial); input.required = true
      attachDriveDirectoryPicker(input, { signal, token })
      return Object.assign(() => {
        if (!input.value.startsWith("/") || input.value.split("/").includes("..")) throw new Error("请输入以 / 开头的有效目录路径")
        return normalizeDrivePath(input.value)
      }, { input })
    }
    try {
      if(kind==="download"&&targets.some(entry=>!canDownloadDriveEntry(entry,id=>Boolean(readDriveShareCode(id)))))throw new Error("所选项目包含未解密的分享，请先解密后再下载")
      if (kind === "refresh") { await refresh(); showPasswordToast("目录已刷新"); return }
      if (kind === "link") {
        const current = new URL(location.href); current.hash = ""
        const links: string[] = []
        let account = user
        for (const item of targets) {
          // Only files have direct download links. All directories, including
          // those inside shares, copy their preview page instead.
          if (item.directory || item.shared) {
            links.push(new URL(item.target, location.origin).href); continue
          }
          const filePath = targetPath(item)
          if (view === "share") {
            const suffix = filePath === "/" ? "" : filePath.split("/").map(encodeURIComponent).join("/")
            const link = new URL(`/sd/${encodeURIComponent(share)}${suffix}`, DRIVE_ORIGIN)
            const code = drivePassword(view, share, filePath)
            if (code) link.searchParams.set("pwd", code)
            links.push(link.href)
          } else {
            const options = { signal, token, anonymous: view === "guest" }
            const meta = await driveRequest<DriveFile>("fs/get", { path: filePath, password: drivePassword(view, share, filePath) }, options)
            account ??= await readAuthorizedDriveUser()
            links.push(driveDownloadUrl(joinDrivePath(account.base_path || "/", filePath), meta.sign))
          }
        }
        if (!links.length) links.push(current.href)
        signal.throwIfAborted()
        const text = links.join("\n")
        try { await navigator.clipboard.writeText(text); showPasswordToast(targets.every(item=>item.shared||item.directory) ? "链接已复制" : "直链已复制") }
        catch { const ui = open(targets.every(item=>item.shared||item.directory) ? "复制链接" : "复制直链"); const area = node("textarea"); area.value = text; area.readOnly = true; ui.body.append(area); ui.submit.hidden = true; ui.cancel.textContent = "关闭"; area.select() }
        return
      }
      if (kind === "download") {
        if (!targets.length) throw new Error("请先选择要下载的文件或文件夹")
        await setupDriveDownload(open("下载文件"), context, targets, signal)
        return
      }
      checkAccount()
      if (kind === "alias") {
        if (view !== "share" || user?.role !== 2 || targets.length !== 1) throw new Error("仅管理员可设置分享内的别名")
        const target = targets[0], relative = targetPath(target)
        const ui = open("设置别名"), input = ui.field("别名", target.alias || "")
        input.maxLength = 200; input.placeholder = target.name
        ui.note(`原名称：${target.name}。留空恢复原名称。`)
        ui.run(async () => {
          checkAccount()
          const response = await fetch("/api/drive/share-update", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", Authorization: token }, signal,
            body: JSON.stringify({ id: share, aliasPath: relative, alias: input.value.trim(), password: drivePassword(view, share, relative) }) })
          const result = await response.json()
          if (!response.ok || result.code !== 200) throw new Error(result.message || "别名保存失败")
          await changed()
        })
        return
      }
      if (kind.startsWith("manage-") || kind === "edit-meta") {
        const directoryMeta = kind === "edit-meta"
        if (view !== "storage" || !user || user.role !== 2) throw new Error("仅管理员可管理空间")
        if (directoryMeta ? context.selected.length !== 1 || !context.selected[0].directory : path !== "/") throw new Error(directoryMeta ? "请选择一个空间目录" : "请在空间首页打开管理功能")
        const management = open(kind === "manage-users" ? "用户" : kind === "manage-storages" ? "存储" : kind === "manage-meta" || directoryMeta ? "元信息" : "任务")
        let dirty = false
        const markChanged = async () => { dirty = true }
        management.dialog.addEventListener("close", () => {
          if (dirty && !signal.aborted) void refresh().catch(() => showPasswordToast("页面同步失败，请刷新后查看"))
        }, { once: true })
        if (kind === "manage-users") await setupDriveUserManager(management, signal, token, user.base_path, markChanged)
        else if (kind === "manage-storages") await setupDriveStorageManager(management, signal, token, user.base_path, markChanged)
        else if (kind === "manage-meta" || directoryMeta) await setupDriveMetaManager(management, signal, token, user.base_path, markChanged, directoryMeta ? joinDrivePath(user.base_path || "/", targetPath(context.selected[0])) : undefined)
        else await setupDriveTaskCenter(management, signal, token)
        return
      }
      if (kind === "upload") {
        await setupDriveUpload(open("上传文件"), { path, signal, token, refresh: () => changed(), tasks: tasks => monitor("upload", tasks, token) })
        return
      }
      if (kind === "folder") {
        const ui = open("新建文件夹"), input = ui.field("名称", "新文件夹"); input.required = true
        ui.run(() => commit("fs/mkdir", { path: joinDrivePath(path, validDriveName(input.value)) }))
        return
      }
      if (kind === "rename" && targets.length === 1) {
        const item = targets[0], ui = open("重命名"), input = ui.field("新名称", item.name); input.required = true
        ui.run(async () => { const name = validDriveName(input.value); if (name === item.name) return; await commit("fs/rename", { path: targetPath(item), name, overwrite: false }, context.directory === false ? driveHref(view, joinDrivePath(srcDir, name), share, false) : undefined) }); return
      }
      if (kind === "batch" || kind === "rename") {
        if (!targets.length) throw new Error("请先选择要批量重命名的文件或文件夹")
        setupBatchRename(open("批量重命名"), targets, { srcDir, view, share, api, validName: validDriveName, commit })
        return
      }
      if (kind === "move" || kind === "copy" || kind === "merge" || kind === "extract") {
        const labels: Record<string, string> = { move: "移动", copy: "复制", merge: "聚合移动", extract: "解压" }
        const ui = open(labels[kind]); ui.note(kind === "merge" ? `将 ${path} 下各级子目录的文件汇集到目标目录，同名文件跳过。此操作会移动原文件。` : `${targets.length} 个项目：${names.join("、")}`)
        const dest = await destination(ui)
        const archivePass = kind === "extract" ? ui.field("压缩包密码（可选）", "", "password") : undefined
        ui.run(async () => {
          const dst = dest()
          if (kind === "merge") { validateDriveDestination(path, dst, true); await commit("fs/recursive_move", { src_dir: path, dst_dir: dst, conflict_policy: "skip" }); return }
          if (kind !== "extract") {
            if (dst === srcDir) throw new Error("请选择与原目录不同的目标目录")
            for (const item of targets) validateDriveDestination(targetPath(item), dst, item.directory)
          }
          await commit(kind === "extract" ? "fs/archive/decompress" : `fs/${kind}`, kind === "extract"
            ? { src_dir: srcDir, dst_dir: dst, name: names, archive_pass: archivePass!.value, inner_path: "/", put_into_new_dir: true, overwrite: false, cache_full: false }
            : { src_dir: srcDir, dst_dir: dst, names, overwrite: false, skip_existing: false }, context.directory === false && kind === "move" ? driveHref("storage", srcDir) : undefined)
        }); return
      }
      if (kind === "delete" || kind === "clean") {
        const ui = open(kind === "delete" ? "删除所选项目" : "移除空文件夹")
        ui.note(kind === "delete" ? `确认删除以下 ${targets.length} 个项目？此操作无法在本站撤销。` : `递归清理 ${path} 下的空文件夹，保留有文件的目录。`)
        if (kind === "delete") { const items = node("ul"); for (const item of targets) items.append(node("li", item.name)); ui.body.append(items) }
        ui.submit.classList.add("is-danger"); ui.submit.textContent = "确认删除"
        ui.run(() => commit(kind === "delete" ? "fs/remove" : "fs/remove_empty_directory", kind === "delete" ? { dir: srcDir, names } : { src_dir: path }, context.directory === false ? driveHref("storage", srcDir) : undefined)); return
      }
      if (kind === "delete-share") {
        if (!managedShareTarget(context) || targets.length !== 1 || user?.role !== 2) throw new Error("请选择自己创建的分享")
        const id = driveRoute(new URL(targets[0].target, location.origin)).share
        const ui = open("取消分享")
        ui.note(`确认取消分享“${id}”？原始文件不会删除。`)
        ui.submit.textContent = "取消分享"; ui.submit.classList.add("is-danger")
        ui.run(async () => {
          checkAccount()
          const response = await fetch("/api/drive/share-delete", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", Authorization: token }, signal, body: JSON.stringify({ id }) })
          const result = await response.json()
          if (!response.ok || result.code !== 200) throw new Error(result.message || "取消分享失败")
          showPasswordToast("分享已取消"); await changed()
        }); return
      }
      if (kind === "share" || kind === "edit-share") {
        if (!user || user.role !== 2 && !((user.permission || 0) & (1 << 14))) throw new Error("当前账号没有分享权限")
        const editing = kind === "edit-share"
        if (editing && user.role !== 2) throw new Error("仅管理员可编辑分享")
        if (editing && (!managedShareTarget(context) || targets.length !== 1)) throw new Error("请选择一个分享项目")
        if (!editing && !targets.length) throw new Error("请先选择要分享的文件或文件夹")
        const ui = open(editing ? "编辑分享" : "创建分享")
        let current: ShareDetails | undefined
        if (editing) {
          const id = driveRoute(new URL(targets[0].target, location.origin)).share
          if (!isDriveShareId(id)) throw new Error("无效的分享名")
          ui.submit.disabled = true; ui.note("正在读取分享信息…")
          current = await api<ShareDetails>(`share/get?id=${encodeURIComponent(id)}`)
          if (signal.aborted || !ui.dialog.open) return
          checkAccount()
          if (!current || !Array.isArray(current.files) || !current.files.length) throw new Error("分享信息不完整")
          if (current.creator !== user.username) throw new Error("只能编辑自己创建的分享")
          current.id = id; ui.body.replaceChildren(); ui.submit.disabled = false
        }
        if (!editing) ui.note(`${targets.length} 个项目：${names.join("、")}`)
        const idInput = ui.field("分享名", current?.id || defaultShareId(targets[0]))
        idInput.placeholder = "文字、数字、下划线或连字符"; idInput.required = editing
        const sharePaths = editing ? setupDriveSharePaths(ui, current!.files, { signal, token, basePath: user.base_path }) : undefined
        const code = ui.field("提取码（可选）", current?.pwd || "")
        const localExpiry = current?.expires ? new Date(new Date(current.expires).getTime() - new Date(current.expires).getTimezoneOffset() * 60000).toISOString().slice(0, 19) : ""
        const expiry = ui.field(editing ? "到期时间（留空为永久）" : "有效天数（0 为永久）", editing ? localExpiry : "7", editing ? "datetime-local" : "number")
        if (editing) expiry.step = "1"
        else { expiry.min = "0"; expiry.max = "36500"; expiry.required = true }
        const initialExpiry = expiry.value
        const maxAccessed = ui.field("最大访问次数（0 为不限）", String(current?.max_accessed || 0), "number")
        maxAccessed.min = "0"; maxAccessed.max = String(Number.MAX_SAFE_INTEGER); maxAccessed.step = "1"; maxAccessed.required = true
        const description = (label: string, placeholder: string, value = "") => createDriveHtmlField(ui.body, { label, placeholder, value, signal })
        const header = description("顶部说明（可选）", "展示在分享目录首页顶部", current?.header)
        const readme = description("底部说明（可选）", "展示在分享目录首页底部", current?.readme)
        const metadata = setupDriveShareSettings(ui.body, current?.remark, signal)
        ui.run(async () => {
          const id = idInput.value.trim()
          if (id && !isDriveShareId(id)) throw new Error("分享名仅支持文字、数字、下划线和连字符，长度为 1–64 个字符")
          const expires = editing
            ? expiry.value === initialExpiry ? current!.expires ?? null : expiry.value ? new Date(expiry.value).toISOString() : null
            : Number(expiry.value) ? new Date(Date.now() + Number(expiry.value) * 86400000).toISOString() : null
          const fields = { pwd: code.value, expires, max_accessed: Number(maxAccessed.value), header: header.value, readme: readme.value, remark: JSON.stringify(metadata(), null, 2) }
          if (editing) {
            const response = await fetch("/api/drive/share-update", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", Authorization: token }, signal, body: JSON.stringify({ ...fields, id: current!.id, new_id: id, files: sharePaths!(), accessed: current!.accessed ?? 0, disabled: current!.disabled ?? false, order_by: current!.order_by, order_direction: current!.order_direction, extract_folder: current!.extract_folder }) })
            const result = await response.json()
            if (!response.ok || result.code !== 200) throw new Error(result.message || "分享更新失败")
            showPasswordToast("分享已更新"); await changed(); return
          }
          checkAccount()
          const response = await fetch("/api/drive/share-create", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", Authorization: token }, signal, body: JSON.stringify({ ...fields, ...(id ? { id } : {}), files: targets.map(item => joinDrivePath(user.base_path || "/", targetPath(item))) }) })
          const result = await response.json()
          if (!response.ok || result.code !== 200) throw new Error(result.message || "创建分享失败")
          const data = result.data as { id: string }
          document.dispatchEvent(new CustomEvent("drive-files-changed"))
          const link = new URL(driveHref("share", "/", data.id), location.origin).href
          const output = driveActionDialog("分享已创建", signal), text = output.field("分享链接", link); text.readOnly = true
          output.note(code.value ? `提取码：${code.value}` : "无需提取码")
          output.submit.textContent = "复制链接"; output.cancel.textContent = "关闭"
          output.run(async () => { await navigator.clipboard.writeText(`${link}${code.value ? `\n提取码：${code.value}` : ""}`); showPasswordToast("分享链接已复制") })
        }); return
      }
      if (kind === "offline") {
        const ui = open("离线下载")
        await setupOfflineDownload(ui, {
          signal, user: user!, path, api, commit, destination,
          tools: path => driveRequest<string[]>(`public/offline_download_tools?path=${encodeURIComponent(path)}`, undefined, { signal }),
        })
        return
      }
    } catch (error) {
      if (!signal.aborted) {
        const text = error instanceof Error ? error.message : "操作失败"
        if (modal) { modal.fail(text); modal.submit.hidden = true; modal.cancel.textContent = "关闭" }
        else showPasswordToast(text, true)
      }
    } finally { if (!modal) active = false }
  }
}
