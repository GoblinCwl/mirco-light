import { drivePassword, driveRequest, driveToken } from "./driveClient"
import { driveSize, joinDrivePath } from "./openlistShared"
import type { driveActionDialog } from "./driveActionDialog"
import { node } from "./driveUi"
import { uploadDriveFile, type UploadMode, type UploadTask } from "./driveUploadProtocol"

type QueueItem = { file: File; path: string; state: "pending" | "uploading" | "success" | "error"; row: HTMLElement; status: HTMLElement; progress: HTMLProgressElement; retry: HTMLButtonElement }
export function safeUploadPath(path: string): string {
  if (path.startsWith("/") || path.split("/").some(part => !part.trim() || part === "." || part === ".." || /[\\\u0000-\u001f\u007f]/.test(part))) throw new Error("上传文件路径无效")
  return path
}
export async function setupDriveUpload(ui: ReturnType<typeof driveActionDialog>, options: {
  path: string; signal: AbortSignal; token: string
  refresh: () => Promise<unknown>; tasks: (tasks: UploadTask[]) => void
}) {
  const { path, signal, token } = options
  const queue = new Map<string, QueueItem>()
  let running = false, configuring = true, reading = false, retryTarget = "", taskPreference = false, chunkSize = 10 * 1024 * 1024, upload: AbortController | undefined
  const configuration = node("div", "", "drive-upload-config"), modeLabel = node("label", "上传模式"), mode = node("select")
  mode.setAttribute("aria-label", "上传模式")
  for (const value of ["Multipart", "Stream", "Form"] as const) { const option = node("option", value); option.value = value; mode.append(option) }
  modeLabel.append(mode); configuration.append(modeLabel)
  const flags = node("div", "", "drive-upload-flags")
  const flag = (label: string) => { const wrapper = node("label"), input = node("input"); input.type = "checkbox"; wrapper.append(input, node("span", label)); flags.append(wrapper); return input }
  const task = flag("添加为任务"), overwrite = flag("覆盖现有文件"), rapid = flag("尝试秒传")
  rapid.checked = true
  const picker = node("div", "", "drive-upload-pickers"), fileLabel = node("label", "选择文件"), files = node("input"), folderLabel = node("label", "选择文件夹"), folders = node("input")
  files.type = folders.type = "file"; files.multiple = folders.multiple = true; folders.setAttribute("webkitdirectory", "")
  fileLabel.append(files); folderLabel.append(folders); picker.append(fileLabel, folderLabel)
  const drop = node("div", "可将文件或文件夹拖入此处", "drive-upload-drop"), list = node("div", "", "drive-upload-list"), summary = node("p", "", "drive-action-note")
  ui.body.append(configuration, flags, picker, drop, summary, list)
  ui.note(`上传到 ${path}`)
  ui.submit.textContent = "开始上传"; ui.submit.disabled = true
  try {
    const saved = JSON.parse(localStorage.getItem("quartz-drive-upload-options") || "null")
    if (saved) { taskPreference = Boolean(saved.asTask); overwrite.checked = Boolean(saved.overwrite); rapid.checked = saved.rapid !== false }
  } catch {}
  const save = () => { try { localStorage.setItem("quartz-drive-upload-options", JSON.stringify({ asTask: taskPreference, overwrite: overwrite.checked, rapid: rapid.checked })) } catch {} }
  const controls = () => {
    const multipart = mode.value === "Multipart"
    task.disabled = multipart; task.checked = !multipart && taskPreference
    ui.submit.disabled = running || configuring || reading || ![...queue.values()].some(item => item.state !== "success")
    const bytes = [...queue.values()].reduce((sum, item) => sum + item.file.size, 0)
    summary.textContent = queue.size ? `${queue.size} 个文件 · ${driveSize(bytes)}` : "尚未选择文件"
  }
  mode.addEventListener("change", controls)
  task.addEventListener("change", () => { taskPreference = task.checked; save() })
  overwrite.addEventListener("change", save); rapid.addEventListener("change", save)
  const add = (file: File, relative = file.webkitRelativePath || file.name) => {
    safeUploadPath(relative)
    const existing = queue.get(relative)
    if (existing) existing.row.remove()
    const row = node("div", "", "drive-upload-row"), name = node("strong", relative), status = node("p", "待上传", "drive-action-note"), progress = node("progress"), retry = node("button", "重试")
    name.title = relative; progress.max = 100; progress.value = 0; progress.setAttribute("aria-label", `${relative} 上传进度`)
    retry.type = "button"; retry.hidden = true
    row.append(name, node("span", driveSize(file.size), "drive-action-note"), progress, status, retry); list.append(row)
    const item: QueueItem = { file, path: relative, state: "pending", row, status, progress, retry }; queue.set(relative, item)
    retry.addEventListener("click", () => { if (!running) { retryTarget = relative; ui.dialog.querySelector("form")!.requestSubmit() } })
  }
  const addFiles = (values: File[]) => { if (running) return; ui.clearError(); try { values.forEach(file => add(file)) } catch (error) { ui.fail(error instanceof Error ? error.message : "无法选择文件")}; controls() }
  files.addEventListener("change", () => { addFiles([...(files.files || [])]); files.value = "" })
  folders.addEventListener("change", () => { addFiles([...(folders.files || [])]); folders.value = "" })
  const readEntry = async (entry: FileSystemEntry, prefix = ""): Promise<void> => {
    if (signal.aborted || running || !ui.dialog.open) return
    const relative = safeUploadPath(prefix + entry.name)
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
      add(file, relative)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (!children.length) break
        for (const child of children) await readEntry(child, relative + "/")
      }
    }
  }
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("is-over") })
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"))
  drop.addEventListener("drop", async event => {
    event.preventDefault(); drop.classList.remove("is-over"); if (running || reading) return
    reading = true; controls()
    const entries = [...(event.dataTransfer?.items || [])].map(item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => Boolean(entry))
    try { if (entries.length) for (const entry of entries) await readEntry(entry); else addFiles([...(event.dataTransfer?.files || [])]) }
    catch (error) { if (!signal.aborted) ui.fail(error instanceof Error ? error.message : "无法读取拖入的文件")}
    reading = false; controls()
  })
  const stop = () => upload?.abort(new DOMException("上传已停止", "AbortError"))
  ui.cancel.addEventListener("click", () => { if (running) stop() })
  ui.dialog.addEventListener("close", stop, { once: true })
  ui.run(async () => {
    if (running || configuring || reading) throw new Error("请等待文件和上传配置读取完成")
    if (!token || driveToken() !== token) throw new Error("登录状态已变化，请重新登录后上传")
    const pending = retryTarget ? [queue.get(retryTarget)!] : [...queue.values()].filter(item => item.state !== "success")
    retryTarget = ""
    if (!pending.length) throw new Error("请先选择文件")
    const settings = { mode: mode.value as UploadMode, asTask: mode.value !== "Multipart" && task.checked, overwrite: overwrite.checked, rapid: rapid.checked }
    running = true; upload = new AbortController()
    const activeSignal = AbortSignal.any([signal, upload.signal])
    ui.cancel.disabled = false; ui.cancel.textContent = "停止上传"
    let cursor = 0, completed = 0, failures = 0
    try {
      await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (!activeSignal.aborted) {
          const index = cursor++; if (index >= pending.length) return
          const item = pending[index]; item.state = "uploading"; item.retry.hidden = true; item.progress.value = 0
          try {
            const response = await uploadDriveFile(joinDrivePath(path, item.path), item.file, {
              ...settings, chunkSize, token, password: drivePassword("storage", "", joinDrivePath(path, item.path)), signal: activeSignal,
              update(status, progress, speed) {
                item.progress.value = progress
                const labels = { hashing: "正在计算哈希", uploading: "正在上传", backending: "正在写入存储" }
                item.status.textContent = `${labels[status]} · ${Math.floor(progress)}%${speed === undefined ? "" : ` · ${driveSize(speed)}/s`}`
              },
            })
            item.state = "success"; item.progress.value = 100; completed++
            item.status.textContent = response?.task ? "已提交后台上传任务" : "上传完成"
            if (response?.task) options.tasks([response.task])
          } catch (error) {
            item.state = "error"; failures++; item.retry.hidden = false
            item.status.textContent = activeSignal.aborted ? "上传已停止" : error instanceof Error ? error.message : "上传失败"
          }
        }
      }))
      if (activeSignal.aborted) {
        for (const item of pending) if (item.state === "pending") { item.state = "error"; item.status.textContent = "上传已停止"; item.retry.hidden = false }
      }
      if (!signal.aborted && driveToken() === token) await options.refresh()
      if (activeSignal.aborted) throw new Error("上传已停止，可重试未完成的文件")
      if (failures) throw new Error(`${completed} 个完成，${failures} 个失败；可逐项重试`)
    } finally {
      running = false; upload = undefined; ui.cancel.textContent = "取消"
      // The common dialog restores disabled states after the request settles.
      window.setTimeout(() => { if (ui.dialog.open) controls() }, 0)
    }
  })
  controls(); ui.submit.disabled = true
  try {
    const settings = await driveRequest<Record<string, string>>("public/settings", undefined, { signal })
    if (settings.multipart_enabled === "false") { mode.querySelector<HTMLOptionElement>('option[value="Multipart"]')!.disabled = true; mode.value = "Stream" }
    const size = Number(settings.multipart_chunk_size)
    if (Number.isFinite(size) && size >= 1) chunkSize = size * 1024 * 1024
  } catch { /* Default to OpenList's 10 MiB chunk setting when unavailable. */ }
  configuring = false
  if (!signal.aborted && ui.dialog.open) controls()
}
