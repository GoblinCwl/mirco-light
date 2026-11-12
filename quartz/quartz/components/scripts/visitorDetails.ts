import { visitorHeaders, ownMeteorId } from "./visitorIdentity"
import { createInfiniteScroll } from "./infiniteScroll"
import { showSiteDialog, closeSiteDialog } from "./siteDialog"
import { createDatePicker } from "./datePicker"

type Visit = { id: string; region: string | null; city?: string | null; browser?: string | null; arrivedOn: string; lastSeenOn: string; firstSeenAt?: string; lastSeenAt?: string }
type Records = { total: number; page: number; pages: number; meteorId?: string; records: Visit[]; distributionTotal?: number; distribution: { region: string; count: number }[] }

const visitTime = (value: string | undefined, fallback: string) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : fallback
const node = (tag: string, text = "", className = "") => {
  const el = document.createElement(tag)
  el.textContent = text
  if (className) el.className = className
  return el
}

export function setupVisitorDetails() {
  const trigger = document.querySelector<HTMLButtonElement>("[data-visitors-open]")
  if (!trigger) return
  const dialog = document.createElement("dialog")
  dialog.className = "activity-details visitor-details"
  dialog.setAttribute("aria-label", "彗星 · 来访记录")
  const header = node("div", "", "activity-details-header")
  header.append(node("strong", "彗星 · 来访记录"))
  const close = document.createElement("button")
  close.type = "button"
  close.setAttribute("aria-label", "关闭来访记录")
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  header.append(close)
  const body = node("div", "", "visitor-details-body")
  const chart = node("section", "", "visitor-distribution")
  chart.setAttribute("aria-label", "来访地区分布")
  const form = document.createElement("form")
  form.className = "visitor-details-filters"
  const region = document.createElement("input")
  region.type = "search"; region.placeholder = "省份或国家"; region.maxLength = 60
  region.setAttribute("aria-label", "按省份或国家查询")
  const datePicker = createDatePicker({ label: "首次来访日期", placeholder: "选择来访日期", clearable: true, onChange: () => {} })
  const rangeDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year:"numeric", month:"2-digit", day:"2-digit" })
  const limitDates=()=>{const today=rangeDate.format(new Date()),start=new Date(`${today}T00:00:00+08:00`);start.setUTCDate(start.getUTCDate()-6);datePicker.set(datePicker.input.value,rangeDate.format(start),today)}
  limitDates()
  const date = datePicker.input
  const dateField = datePicker.element
  const search = document.createElement("button")
  search.type = "submit"; search.textContent = "查询"
  form.append(region, dateField, search)
  const rangeNote=node("p","来访记录仅显示最近 7 天，地区统计保留历史数据。","visitor-details-caption")
  const results = node("div", "", "visitor-details-results")
  results.setAttribute("aria-live", "polite")
  const pagination = node("div", "", "infinite-scroll-trigger")
  const pageInfo = node("span")
  const retry = document.createElement("button")
  retry.type = "button"; retry.textContent = "重试"; retry.hidden = true
  pagination.append(pageInfo, retry)
  body.append(chart, rangeNote, form, results, pagination)
  dialog.append(header, body)
  document.body.append(dialog)
  const lifecycle = new AbortController()
  header.after(form)
  const seen = new Set<string>()
  let page = 0, hasMore = false, queryRegion = "", queryDay = ""
  const paging = createInfiniteScroll(pagination, () => load(true), { root: body, signal: lifecycle.signal })
  let request: AbortController | undefined
  const load = async (append = false) => {
    paging.setEnabled(false)
    retry.hidden = true
    if (!append) { page = 0; seen.clear(); body.scrollTop = 0 }
    request?.abort()
    const pending = request = new AbortController()
    results.setAttribute("aria-busy", "true")
    if (!append) chart.setAttribute("aria-busy", "true")
    const loading = node("div", "", "visitor-details-loading")
    loading.append(node("span", "", "activity-details-spinner"), node("span", "正在追溯来访星迹…"))
    if (!append) results.replaceChildren(loading)
    pagination.hidden = !append
    pageInfo.textContent = append ? "正在追溯来访星迹…" : ""
    const started = performance.now()
    try {
      const params = new URLSearchParams({ page: String(page + 1), region: queryRegion, day: queryDay })
      const response = await fetch(`/api/visitors/records?${params}`, { credentials: "omit", cache: "no-store", headers: visitorHeaders(), signal: AbortSignal.any([pending.signal, AbortSignal.timeout(12000)]) })
      if (!response.ok) throw new Error("Unavailable")
      const data: Records = await response.json()
      if (!Array.isArray(data.records)) throw new Error("Invalid records")
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 250 - (performance.now() - started))))
      if (pending.signal.aborted || !dialog.open) return
      page = data.page
      if (!append) {
        chart.replaceChildren(node("strong", "来访星系", "visitor-distribution-title"))
        const distribution = data.distribution.slice(0, 6)
        const remaining = data.distribution.slice(6).reduce((sum, item) => sum + item.count, 0)
        if (remaining) distribution.push({ region: "其他", count: remaining })
        const maximum = Math.max(1, ...distribution.map(item => item.count))
        distribution.forEach((item, index) => {
          const row = node("div", "", "visitor-distribution-row")
          const track = node("span", "", "visitor-distribution-track")
          const bar = node("span")
          bar.style.width = `${item.count / maximum * 100}%`
          track.append(bar)
          row.style.setProperty("--distribution-color", ["#75aabd", "#a58abc", "#80ad9c", "#bea06b", "#839fbe", "#b18fa1", "#88939d"][index])
          const distributionTotal=data.distributionTotal??data.total
          const share = distributionTotal ? Math.round(item.count / distributionTotal * 100) : 0
          row.title = `${item.region} · ${item.count} 位 · ${share}%`
          row.append(node("span", item.region, "visitor-distribution-label"), track, node("span", `${item.count} · ${share}%`, "visitor-distribution-value"))
          chart.append(row)
        })
        if (!distribution.length) chart.append(node("p", "暂无对应地区记录", "visitor-details-caption"))
      }
      const list = append ? results.querySelector(".visitor-records") || node("ol", "", "visitor-records") : node("ol", "", "visitor-records")
      for (const visit of data.records) {
        if (seen.has(visit.id)) continue
        seen.add(visit.id)
        const item = node("li", "", "visitor-record")
        const own = (data.meteorId ?? ownMeteorId()) === visit.id
        if (own) item.classList.add("is-own")
        const mark = node("span", "", "visitor-record-mark")
        mark.setAttribute("aria-hidden", "true")
        const colors = ["#75aabd", "#a58abc", "#80ad9c", "#bea06b", "#839fbe"]
        item.style.setProperty("--visitor-color", colors[parseInt(visit.id.slice(0, 4), 16) % colors.length])
        const info = node("div", "", "visitor-record-info")
        const location = [visit.region || "未知区域", visit.city && visit.city !== visit.region ? visit.city : null].filter(Boolean).join(" · ")
        info.append(node("strong", location), node("span", own ? "你的彗星" : `星迹 ${visit.id.slice(0, 6).toUpperCase()}`, "visitor-record-code"))
        const dates = node("div", "", "visitor-record-dates")
        const lastTime = node("time", visitTime(visit.lastSeenAt, visit.lastSeenOn))
        if (visit.lastSeenAt) lastTime.setAttribute("datetime", visit.lastSeenAt)
        dates.append(node("span", visit.browser || "未知浏览器", "visitor-record-browser"), lastTime)
        item.append(mark, info, dates)
        list.append(item)
      }
      if (!append) results.replaceChildren(data.records.length ? list : node("div", "没有找到对应的来访星迹", "visitor-details-loading"))
      hasMore = data.page < data.pages && data.records.length > 0
      pagination.hidden = !hasMore
      pageInfo.textContent = ""
      paging.setEnabled(hasMore)
    } catch {
      if (!pending.signal.aborted && dialog.open) {
        if (!append) { results.replaceChildren(node("div", "信号暂不可达，请重新查询", "visitor-details-loading")); chart.replaceChildren() }
        pagination.hidden = false
        pageInfo.textContent = append ? "信号暂不可达" : ""
        retry.hidden = false
      }
    } finally { if (!pending.signal.aborted) { results.setAttribute("aria-busy", "false"); chart.setAttribute("aria-busy", "false") } }
  }
  const open = () => {
    if (dialog.open) return
    limitDates()
    showSiteDialog(dialog)
    trigger.setAttribute("aria-expanded", "true")
    void load()
  }
  trigger.addEventListener("click", open)
  close.addEventListener("click", () => void closeSiteDialog(dialog))
  dialog.addEventListener("close", () => { if(dialog.open)return;datePicker.close(); paging.setEnabled(false); request?.abort(); trigger.setAttribute("aria-expanded", "false") })
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) void closeSiteDialog(dialog)
  })
  form.addEventListener("submit", event => { event.preventDefault(); queryRegion = region.value.trim(); queryDay = date.value; void load() })
  retry.addEventListener("click", () => void load(page > 0))
  window.addCleanup(() => { lifecycle.abort(); request?.abort(); trigger.removeEventListener("click", open); dialog.close(); dialog.remove() })
}
