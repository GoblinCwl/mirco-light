import {requireDriveUser as readAuthorizedDriveUser} from './driveClient'
import {showPasswordToast} from './passwordFeedback'
import type { ActionContext, ActionEntry } from "./driveActions"
import { drivePassword, driveRequest, driveRoute, driveToken, type DriveView } from "./driveClient"
import { DRIVE_ORIGIN, driveDownloadUrl, driveSize, joinDrivePath, type DriveFile } from "./openlistShared"
import { driveActionDialog } from "./driveActionDialog"
import { node } from "./driveUi"
import createZip from "./vendor/openlistZip"
import streamSaver from "./vendor/StreamSaver"

streamSaver.mitm = `${DRIVE_ORIGIN}/streamer/mitm.html`
type DownloadFile = { view?:DriveView;share?:string; name: string; path: string; size: number; modified?: string; directory?: boolean }

export function safeDownloadName(name: string): string {
  if (!name || name === "." || name === ".." || /[/\\\u0000-\u001f\u007f]/.test(name)) throw new Error("文件名无效，无法打包")
  return name
}
export function checkZipSize(files: DownloadFile[]) {
  const encode = new TextEncoder()
  const size = 22 + files.reduce((sum, file) => sum + (file.directory ? 0 : file.size) + 92 + 2 * encode.encode(file.name).length, 0)
  if (files.length > 65535 || size > 0xffffffff) throw new Error("单个 ZIP 需小于 4 GB 且不超过 65535 项，请分批下载")
}

export async function setupDriveDownload(ui: ReturnType<typeof driveActionDialog>, context: ActionContext, targets: ActionEntry[], lifecycle: AbortSignal) {
  if (!targets.length) throw new Error("请先选择要下载的文件或文件夹")
  const controller = new AbortController(), signal = AbortSignal.any([lifecycle, controller.signal])
  ui.dialog.addEventListener("close", () => controller.abort(), { once: true })
  const { view, share } = context, token = driveToken(), anonymous = view === "guest" || view === "share"
  const options = { signal, anonymous, token }
  const status = node("p", "正在读取所选文件…", "drive-action-note"), progress = node("progress"), rows = node("div", "", "drive-download-list")
  progress.hidden = true; progress.setAttribute("aria-label", "打包下载进度")
  const methodLabel = node("label", "下载方式"), method = node("select")
  method.setAttribute("aria-label", "下载方式")
  for (const [value, text] of [["batch", "批量下载"], ["zip", "打包下载（ZIP）"]]) {
    const option = node("option", text); option.value = value; method.append(option)
  }
  methodLabel.append(method); ui.body.append(methodLabel, status, progress, rows)
  ui.submit.textContent = "批量下载"; ui.submit.disabled = true; ui.cancel.textContent = "关闭"
  let account = view === "storage" ? context.user : undefined, pack: AbortController | undefined, preparing = true
  const files: DownloadFile[] = []
  const updateMethod = () => {
    const count = files.filter(file => !file.directory).length
    ui.submit.textContent = method.value === "zip" ? "打包下载（ZIP）" : count === 1 ? "下载文件" : "批量下载"
    ui.submit.disabled = preparing || method.value === "batch" && count === 0
  }
  method.addEventListener("change", updateMethod)
  const live = () => !signal.aborted && ui.dialog.open
  const check = () => { signal.throwIfAborted(); if (!anonymous && token !== driveToken()) throw new Error("登录状态已变化，请重新选择文件") }
  const downloadUrl = async (file: DownloadFile) => {
    check()
    const fileView=file.view||view,fileShare=file.share??share
    if (fileView === "share") {
      const suffix = file.path === "/" ? "" : file.path.split("/").map(encodeURIComponent).join("/")
      const link = new URL(`/sd/${encodeURIComponent(fileShare)}${suffix}`, DRIVE_ORIGIN)
      if (drivePassword(fileView, fileShare, file.path)) link.searchParams.set("pwd", drivePassword(fileView, fileShare, file.path))
      link.searchParams.set("download", "true"); return link.href
    }
    const meta = await driveRequest<DriveFile>("fs/get", { path: file.path, password: drivePassword(fileView, fileShare, file.path) }, options)
    account ??= await readAuthorizedDriveUser()
    const link = new URL(driveDownloadUrl(joinDrivePath(account.base_path || "/", file.path), meta.sign))
    link.searchParams.set("download", "true"); return link.href
  }
  const append = async (item: ActionEntry, name: string, path: string, depth = 0, scope:{view:DriveView;share:string}={view,share}): Promise<void> => {
    check()
    if (!live()) return
    if (depth > 128 || files.length >= 65535) throw new Error("目录层级过深或项目过多，请分批下载")
    safeDownloadName(item.name)
    if (item.directory) {
      const data = await driveRequest<{ content: DriveFile[] | null }>("fs/list", { path: scope.view==="share"?`/@s/${scope.share}${path==="/"?"":path}`:path, password: drivePassword(scope.view, scope.share, path), page: 1, per_page: 0, refresh: false }, {...options,anonymous:scope.view==="share"||scope.view==="guest"})
      const children = data.content || []
      if (!children.length) files.push({ name: name + "/", path, size: 0, directory: true,...scope })
      for (const child of children) {
        safeDownloadName(child.name)
        await append({ name: child.name, target: "", directory: child.is_dir, size: child.size }, `${name}/${child.name}`, joinDrivePath(path, child.name), depth + 1,scope)
      }
    } else {
      files.push({ name, path,...scope, size: Math.max(0, item.size || 0), modified: (item as ActionEntry & { modified?: string }).modified })
    }
  }
  ui.cancel.addEventListener("click", () => { if (pack) pack.abort(new DOMException("下载已取消", "AbortError")) })
  ui.run(async () => {
    if (preparing) throw new Error("请等待目录读取完成")
    check()
    if (method.value === "batch") {
      const selectedFiles = files.filter(file => !file.directory)
      if (!selectedFiles.length) throw new Error("所选目录中没有可下载的文件")
      for (const file of selectedFiles) {
        const url = await downloadUrl(file)
        check()
        // The browser owns each original-file download, independently of the dialog.
        const frame = node("iframe"); frame.hidden = true; frame.title = `下载 ${file.name}`
        frame.setAttribute("sandbox", "allow-downloads"); frame.src = url; document.body.append(frame)
      }
      showPasswordToast(`已开始下载 ${selectedFiles.length} 个文件`)
      return
    }
    checkZipSize(files)
    pack = new AbortController()
    const packSignal = AbortSignal.any([signal, pack.signal])
    const filename = safeDownloadName(targets.length === 1 ? targets[0].name : context.name || "Share") + ".zip"
    // Create the save stream within the click gesture, as OpenList does.
    const output = streamSaver.createWriteStream(filename)
    let index = 0, received = 0
    const total = files.reduce((sum, item) => sum + item.size, 0)
    progress.hidden = false; progress.max = Math.max(1, total); progress.value = 0
    ui.cancel.disabled = false; ui.cancel.textContent = "停止下载"
    status.textContent = "正在打包下载…"
    const zip = createZip({
      async pull(zip) {
        check(); packSignal.throwIfAborted()
        if (index >= files.length) { zip.close(); return }
        let file: DownloadFile, name: string
        do {
          if (index >= files.length) { zip.close(); return }
          file = files[index++]
          // A single selected folder becomes the ZIP root, matching OpenList's layout.
          name = targets.length === 1 && targets[0].directory ? file.name.slice(targets[0].name.length + 1) : file.name
        } while (!name)
        status.textContent = `正在下载 ${index}/${files.length}：${name}`
        if (file.directory) { zip.enqueue({ name, directory: true }); return }
        const url = await downloadUrl(file)
        packSignal.throwIfAborted()
        const response = await fetch(url, { credentials: "omit", signal: packSignal })
        if (!response.ok || !response.body) throw new Error(`${name} 下载失败（${response.status}）`)
        const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, stream) { received += chunk.byteLength; if (live()) progress.value = received; stream.enqueue(chunk) },
        }))
        zip.enqueue({ name, stream, ...(file.modified ? { lastModified: Date.parse(file.modified) || undefined } : {}) })
      },
      cancel(reason) { pack?.abort(reason) },
    })
    try { await zip.pipeTo(output, { signal: packSignal });showPasswordToast("打包下载完成") }
    catch (error) { pack.abort(); throw error instanceof DOMException && error.name === "AbortError" ? new Error("下载已取消") : error }
    finally { pack = undefined; ui.cancel.textContent = "关闭"; progress.hidden = true }
  })
  try {
    for (const item of targets) {
      const route=driveRoute(new URL(item.target,location.origin))
      let resolved=item
      if(item.shared){
        const meta=await driveRequest<DriveFile>('fs/get',{path:`/@s/${route.share}${route.path==='/'?'':route.path}`,password:drivePassword('share',route.share,route.path)},{signal,anonymous:true})
        resolved={...item,directory:meta.is_dir,size:meta.size,modified:meta.modified}
      }
      await append(resolved,safeDownloadName(item.name),route.path,0,{view:route.view,share:route.share})
    }
    if (!live()) return
    const total = files.reduce((sum, file) => sum + file.size, 0)
    status.textContent = `${files.filter(file => !file.directory).length} 个文件 · ${driveSize(total)}`
    for (const file of files) {
      if (file.directory) continue
      const button = node("button", file.name); button.type = "button"
      button.addEventListener("click", async () => {
        button.disabled = true
        try {
          const link = node("a"); link.href = await downloadUrl(file); link.download = file.name.split("/").at(-1)!; link.target = "_blank"; link.rel = "noopener"
          if (!live()) return
          document.body.append(link); link.click(); link.remove()
        } catch (error) { if (live()) ui.fail(error instanceof Error ? error.message : "下载失败")}
        finally { button.disabled = false }
      })
      rows.append(button)
    }
    preparing = false; updateMethod()
  } catch (error) {
    if (live()) { ui.fail(error instanceof Error ? error.message : "目录读取失败"); status.textContent = "" }
  }
}
