import {renderAdminPagination} from "./adminPagination"
import { node } from "./driveUi"
import { showPasswordToast } from "./passwordFeedback"
import { showAdminListMessage } from "./adminListState"

type AlertRecord = {
  id: number
  kind: string
  level: string
  source: string
  title: string
  message: string
  target: string
  code: number
  firstSeen: string
  lastSeen: string
  occurrences: number
}
type Result = { records: AlertRecord[]; page: number; pages: number; total: number }
const kinds: Record<string, string> = {
  service: "服务异常",
  api: "外部 API",
  runtime: "运行异常",
}
const paths: Record<string, string> = {
  service:
    '<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5m-5 11h5"/>',
  api: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
  task: '<path d="M8 3h8v4H8zM8 5H5v16h14V5h-3M8 12h8m-8 4h5"/>',
  runtime: '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01"/>',
}
const svg = (path: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

export function setupAlertCenter(
  root: HTMLElement,
  signal: AbortSignal,
  request: (path: string, init?: RequestInit) => Promise<any>,
) {
  root.classList.add("alert-center")
  let page = 1,
    query = "",
    revision = 0,
    loaded = false,
    clearing = false,
    confirming = false,
    canClear = false
  const toolbar = node("form", "", "alert-toolbar"),
    type = node("select"),
    search = node("input")
  type.setAttribute("aria-label", "告警类型")
  type.append(
    new Option("全部类型", ""),
    ...Object.entries(kinds).map(([value, label]) => new Option(label, value)),
  )
  search.type = "search"
  search.placeholder = "搜索来源或异常内容"
  search.setAttribute("aria-label", "搜索告警")
  const button = (label: string, path: string) => {
    const value = node("button")
    value.type = "button"
    value.title = label
    value.setAttribute("aria-label", label)
    value.innerHTML = svg(path)
    return value
  }
  const submit = button("查询告警", '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>')
  submit.type = "submit"
  const refresh = button(
    "刷新告警记录",
    '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  )
  const clear = node("button", "清空", "alert-clear is-danger")
  clear.type = "button"
  clear.title = "清空全部告警记录"
  clear.disabled = true
  toolbar.append(type, search, submit, refresh, clear)
  const summary = node("p", "连续同类异常合并计数。", "data-admin-note")
  const list = node("div", "", "alert-list"),
    footer = node("div", "", "stellar-admin-pagination")
  list.setAttribute("aria-label", "告警记录")
  root.append(toolbar, summary, list, footer)
  const stamp = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false })
  const load = async () => {
    if (clearing || signal.aborted) return
    confirming = false
    clear.textContent = "清空"
    clear.disabled = true
    const ticket = ++revision
    refresh.disabled = true
    list.setAttribute("aria-busy", "true")
    if (!loaded) {
      const loading = node("div", "", "data-admin-loading"),
        spinner = node("span", "", "drive-loading")
      spinner.setAttribute("role", "status")
      spinner.setAttribute("aria-label", "正在读取告警记录")
      spinner.append(node("i"))
      loading.append(spinner)
      list.replaceChildren(loading)
    }
    try {
      const result: Result = await request(
        "/admin/alerts?" + new URLSearchParams({ page: String(page), kind: type.value, query }),
      )
      if (signal.aborted || ticket !== revision) return
      loaded = true
      canClear = result.total > 0 || Boolean(query || type.value)
      page = result.page
      list.replaceChildren()
      footer.replaceChildren()
      summary.textContent = `共 ${result.total} 条记录 · 连续同类异常合并计数`
      if (!result.records.length)
        showAdminListMessage(
          list,
          "暂无告警记录",
          query || type.value
            ? "没有符合当前条件的记录。"
            : "服务或接口出现异常时，会在这里留下记录。",
        )
      for (const record of result.records) {
        const row = node("article", "", "alert-record"),
          icon = node("span", "", "alert-record-icon")
        row.dataset.level = record.level
        icon.innerHTML = svg(paths[record.kind] || paths.runtime)
        const copy = node("div", "", "alert-record-copy"),
          context = node("div", "", "alert-record-context")
        const severity = node("span", record.level === "warning" ? "警告" : "错误", "alert-level")
        context.append(
          severity,
          node("span", kinds[record.kind] || record.kind),
          node("span", record.source),
        )
        const title = node("strong", record.title),
          message = node("p", record.message),
          meta = node("div", "", "alert-record-meta")
        meta.append(
          node("span", "首次 " + stamp(record.firstSeen)),
          node("span", "最近 " + stamp(record.lastSeen)),
        )
        if (record.target) meta.append(node("span", record.target))
        if (record.code) meta.append(node("span", `错误码 ${record.code}`))
        copy.append(context, title)
        if (record.message) copy.append(message)
        copy.append(meta)
        row.append(
          icon,
          copy,
          node("span", `${record.occurrences.toLocaleString("zh-CN")} 次`, "alert-record-count"),
        )
        list.append(row)
      }
      renderAdminPagination(footer,page,result.pages,result.total,value=>{page=value;void load()})
    } catch (error) {
      if (!signal.aborted && ticket === revision) {
        showPasswordToast(error instanceof Error ? error.message : "告警记录读取失败", true)
        if (!loaded)
          showAdminListMessage(list, "暂时无法读取告警", "请稍后重试。", () => void load())
      }
    } finally {
      if (ticket === revision) {
        list.removeAttribute("aria-busy")
        refresh.disabled = false
        clear.disabled = !loaded || !canClear
      }
    }
  }
  toolbar.onsubmit = (event) => {
    event.preventDefault()
    query = search.value.trim()
    page = 1
    void load()
  }
  type.onchange = () => {
    page = 1
    void load()
  }
  clear.onclick = async () => {
    if (clearing || clear.disabled) return
    if (!confirming) { confirming = true; clear.textContent = "确认清空"; return }
    clearing = true
    ++revision
    const controls = [type, search, submit, refresh, clear], disabled = controls.map(control => control.disabled)
    controls.forEach(control => control.disabled = true)
    clear.textContent = "清空中"
    try {
      await request("/admin/alerts", { method: "DELETE" })
      if (signal.aborted) return
      page = 1; query = ""; search.value = ""; type.value = ""
      showPasswordToast("告警记录已清空")
      clearing = false
      await load()
    } catch (error) {
      if (!signal.aborted) showPasswordToast(error instanceof Error ? error.message : "清空失败", true)
    } finally {
      clearing = false; confirming = false
      if (!signal.aborted) {
        controls.forEach((control, index) => control.disabled = disabled[index])
        clear.textContent = "清空"; clear.disabled = !loaded || !canClear
        refresh.disabled = false
      }
    }
  }
  refresh.onclick = () => void load()
  void load()
  return () => void load()
}
