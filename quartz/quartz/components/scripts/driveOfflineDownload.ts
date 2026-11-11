import { drivePassword, type DriveUser } from "./driveClient"
import { driveSize, joinDrivePath, type DriveFile } from "./openlistShared"
import { driveActionDialog } from "./driveActionDialog"
import { node } from "./driveUi"
import { torrentBase64, torrentMagnet, type TorrentInfo } from "./driveTorrent"

type UI = ReturnType<typeof driveActionDialog>
type Destination = (() => string) & { input: HTMLInputElement }
type API = <T>(route: string, body: object) => Promise<T>
const policies = [
  ["upload_download_stream", "边下载边上传（不保留临时文件）"],
  ["delete_on_upload_succeed", "上传成功后删除临时文件"],
  ["delete_on_upload_failed", "上传失败后删除临时文件"],
  ["delete_never", "始终保留临时文件"],
  ["delete_always", "上传结束后始终删除临时文件"],
] as const

export async function setupOfflineDownload(ui: UI, options: {
  signal: AbortSignal; user: DriveUser; path: string; api: API
  tools: (path: string) => Promise<string[]>
  destination: (ui: UI, initial: string) => Promise<Destination>
  commit: (route: string, body: object) => Promise<void>
}) {
  const { signal, api } = options
  let tab: "link" | "torrent" = "link", tools: string[] = [], parsing = false, loading = true
  let torrent: { data: string; info: TorrentInfo; magnet: string } | undefined, provider = "", rapidFailed = false, sequence = 0, parseSequence = 0
  const tabs = node("div", "", "drive-download-tabs"); tabs.setAttribute("role", "tablist")
  const linkTab = node("button", "链接下载"), btTab = node("button", "BT 下载")
  for (const button of [linkTab, btTab]) { button.type = "button"; button.setAttribute("role", "tab"); tabs.append(button) }
  const linkPanel = node("div", "", "drive-download-panel"), btPanel = node("div", "", "drive-download-panel")
  const label = node("label", "下载链接（每行一条）"), urls = node("textarea")
  urls.placeholder = "支持 HTTP、HTTPS、FTP、磁力链和 ed2k 链接"; label.append(urls); linkPanel.append(label)
  const fileLabel = node("label", "选择或拖入 .torrent 种子"), file = node("input"); file.type = "file"; file.accept = ".torrent"; fileLabel.append(file)
  const info = node("div", "", "drive-torrent-info"); btPanel.append(fileLabel, info)
  ui.body.append(tabs, linkPanel, btPanel)
  const destination = await options.destination(ui, options.path)
  destination.input.closest("label")!.firstChild!.textContent = "保存目录"
  const toolLabel = node("label", "下载工具"), tool = node("select"); tool.setAttribute("aria-label", "下载工具"); toolLabel.append(tool)
  const policyLabel = node("label", "删除策略"), policy = node("select"); policy.setAttribute("aria-label", "删除策略"); policyLabel.append(policy)
  const hint = node("p", "", "drive-action-note"), rapidHint = node("p", "", "drive-action-note")
  const exportCAS = node("button", "导出 CAS 文件"); exportCAS.type = "button"; exportCAS.hidden = true
  ui.body.append(toolLabel, policyLabel, hint, rapidHint, exportCAS)
  const alive = () => !signal.aborted && ui.dialog.open
  const btOnly = () => tab === "torrent" || urls.value.split(/\r?\n/).some(url => /^(magnet:\?|ed2k:\/\/)/i.test(url.trim()))
  const rapid = () => tab === "torrent" && torrent?.info.has_cas && provider === "189CloudPC" && !rapidFailed
  const renderPolicies = () => {
    const previous = policy.value
    policy.replaceChildren()
    if (!tool.value) return
    for (const [value, label] of policies) {
      if (value === "upload_download_stream" && tool.value !== "SimpleHttp") continue
      const option = node("option", label); option.value = value; policy.append(option)
    }
    policy.value = [...policy.options].some(option => option.value === previous) ? previous : tool.value === "SimpleHttp" ? "upload_download_stream" : "delete_on_upload_succeed"
  }
  const update = () => {
    if (!alive()) return
    const selected = tool.value, allowed = tools.filter(name => !btOnly() || name !== "SimpleHttp")
    tool.replaceChildren(...allowed.map(name => { const option = node("option", name); option.value = name; return option }))
    if (allowed.includes(selected)) tool.value = selected
    renderPolicies()
    linkPanel.hidden = tab !== "link"; btPanel.hidden = tab !== "torrent"
    linkTab.setAttribute("aria-selected", String(tab === "link")); btTab.setAttribute("aria-selected", String(tab === "torrent"))
    urls.required = tab === "link"
    toolLabel.hidden = policyLabel.hidden = Boolean(rapid())
    tool.disabled = loading || !allowed.length; policy.disabled = loading || !allowed.length
    hint.textContent = parsing ? "正在解析种子…" : loading ? "正在读取可用下载工具…" : !allowed.length && !rapid() ? "当前目录没有适用于此下载类型的工具" : btOnly() ? "BT／磁力链／ed2k 不使用 SimpleHttp，请选择支持对应协议的工具。" : "删除策略只作用于下载工具的临时文件，不会删除保存目录中的文件。"
    rapidHint.textContent = rapid() ? "此种子带有 CAS 信息，当前目录支持天翼云秒传，将优先尝试秒传。" : rapidFailed ? "可选择下载工具，再次点击开始下载以使用普通离线下载。" : ""
    rapidHint.hidden = !rapidHint.textContent
    exportCAS.hidden = !(tab === "torrent" && torrent?.info.has_cas && torrent.info.cas)
    ui.submit.textContent = rapid() ? "尝试秒传" : "开始下载"
    ui.submit.disabled = loading || parsing || (!rapid() && !allowed.length) || (tab === "link" ? !urls.value.trim() : !torrent)
  }
  const readTools = async () => {
    const id = ++sequence; loading = true; provider = ""; rapidFailed = false; update()
    try {
      const path = destination()
      const [available, meta] = await Promise.all([options.tools(joinDrivePath(options.user.base_path || "/", path)),
        torrent?.info.has_cas ? api<DriveFile & { provider?: string }>("fs/get", { path, password: drivePassword("storage", "", path) }).catch(() => undefined) : Promise.resolve(undefined)])
      if (!alive() || id !== sequence) return
      tools = available; provider = meta?.provider || ""
    } catch (error) { if (alive() && id === sequence) { tools = []; ui.fail(error instanceof Error ? error.message : "读取下载工具失败")} }
    finally { if (alive() && id === sequence) { loading = false; update() } }
  }
  const parseFile = async (selected: File, append: boolean) => {
    const id = ++parseSequence
    if (!append) { torrent = undefined; info.replaceChildren(); update() }
    if (!selected.name.toLowerCase().endsWith(".torrent")) { ui.fail("请选择 .torrent 种子文件"); return }
    if (selected.size > 10 * 1024 * 1024) { ui.fail("种子文件不能超过 10 MB"); return }
    parsing = true; ui.clearError(); if (!append) torrent = undefined; update()
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer()), data = torrentBase64(bytes)
      const value = await api<TorrentInfo>("fs/torrent/parse", { torrent_data: data })
      if (!alive() || id !== parseSequence) return
      const magnet = torrentMagnet(bytes, value)
      if (append) urls.value = [urls.value.trim(), magnet].filter(Boolean).join("\n")
      else {
        torrent = { data, info: value, magnet }; rapidFailed = false
        info.replaceChildren(node("strong", value.name), node("p", `${value.files.length} 个文件 · ${driveSize(value.total_size)}`, "drive-action-note"))
        const list = node("ul"); for (const entry of value.files) list.append(node("li", `${entry.path} · ${driveSize(entry.size)}`)); info.append(list)
        await readTools()
      }
    } catch (error) { if (alive() && id === parseSequence) { if (!append) info.replaceChildren(); ui.fail(error instanceof Error ? error.message : "种子解析失败")} }
    finally { if (alive() && id === parseSequence) { parsing = false; update() } }
  }
  const switchTab = (value: typeof tab) => { tab = value; ui.clearError(); update() }
  linkTab.addEventListener("click", () => switchTab("link")); btTab.addEventListener("click", () => switchTab("torrent"))
  urls.addEventListener("input", update); tool.addEventListener("change", () => { renderPolicies(); update() })
  destination.input.addEventListener("change", () => void readTools())
  file.addEventListener("change", () => { if (file.files?.[0]) void parseFile(file.files[0], false) })
  ui.dialog.addEventListener("dragover", event => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault() })
  ui.dialog.addEventListener("drop", async event => {
    event.preventDefault(); if (ui.submit.getAttribute("aria-busy") === "true" || parsing) return
    const files = [...(event.dataTransfer?.files || [])].filter(file => file.name.toLowerCase().endsWith(".torrent"))
    if (!files.length) { ui.fail("请拖入 .torrent 种子文件"); return }
    if (tab === "torrent") await parseFile(files[0], false)
    else for (const file of files) { if (!alive()) break; await parseFile(file, true) }
  })
  exportCAS.addEventListener("click", () => {
    const value = torrent?.info; if (!value?.cas) return
    const content = torrentBase64(new TextEncoder().encode(JSON.stringify({ md5: value.cas.file_md5, name: value.name, size: value.total_size, sliceMd5: value.cas.slice_md5 })))
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" })), link = node("a")
    link.href = url; link.download = `${value.name}.cas`; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  ui.run(async () => {
    if (parsing || loading) throw new Error("请等待种子解析和工具加载完成")
    const path = destination()
    if (rapid() && torrent) {
      try { await options.commit("fs/torrent/rapid_upload", { torrent_data: torrent.data, path }); return }
      catch (error) {
        rapidFailed = true
        // Update after the common dialog restores its controls following a failed request.
        window.setTimeout(() => update(), 0)
        throw new Error(`秒传未成功，可选择工具后再次下载。${error instanceof Error ? error.message : ""}`)
      }
    }
    const links = tab === "torrent" && torrent ? [torrent.magnet] : urls.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
    if (!links.length || links.some(link => !/^(https?:\/\/|magnet:\?|ftp:\/\/|ed2k:\/\/)/i.test(link))) throw new Error("请填写有效的下载链接，每行一条")
    if (tab === "torrent" && !torrent) throw new Error("请先选择并解析种子文件")
    if (!tools.includes(tool.value) || btOnly() && tool.value === "SimpleHttp") throw new Error("请选择支持此下载类型的工具")
    if (!policies.some(([value]) => value === policy.value) || policy.value === "upload_download_stream" && tool.value !== "SimpleHttp") throw new Error("请选择适用于当前工具的删除策略")
    await options.commit("fs/add_offline_download", { path, urls: links, tool: tool.value, delete_policy: policy.value })
  })
  update(); await readTools()
}
