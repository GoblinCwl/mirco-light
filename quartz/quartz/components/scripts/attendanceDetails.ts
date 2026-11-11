import {readAttendanceMonth,peekAttendanceMonth,type AttendanceMonth} from './attendanceClient'
import { showSiteDialog } from "./siteDialog"
import { createDatePicker } from "./datePicker"

export type AttendanceDetail = { date: string; status?: string; holidayName?: string; specialName?: string; location?: string; weather?: string; bannerIcon?: string; preview?: boolean }
const labels: Record<string, string> = { work: "出勤", business_trip: "出差", onsite: "驻场", fieldwork: "外勤", remote: "居家", comp_off: "调休", weekend: "周末", leave: "请假", holiday: "节假日" }
const el = (tag: string, text = "", className = "") => {
  const node = document.createElement(tag)
  node.textContent = text
  if (className) node.className = className
  return node
}
export function createAttendanceDetails(button: HTMLButtonElement | null, getState: () => { month: string; today: string; earliest: string; latest: string; loaded: boolean; records: AttendanceDetail[] }) {
  const dialog = document.createElement("dialog")
  dialog.className = "activity-details attendance-details"
  dialog.setAttribute("aria-label", "星历 · 日期详情")
  const header = el("div", "", "activity-details-header")
  header.append(el("strong", "星历 · 日期详情"))
  const close = document.createElement("button")
  close.type = "button"; close.setAttribute("aria-label", "关闭日期详情")
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  header.append(close)
  const body = el("div", "", "attendance-details-body")
  const controls = el("div", "", "attendance-details-controls")
  const prev = document.createElement("button"), next = document.createElement("button")
  prev.type = next.type = "button"; prev.textContent = "‹"; next.textContent = "›"
  prev.setAttribute("aria-label", "上个月"); next.setAttribute("aria-label", "下个月")
  const datePicker = createDatePicker({ label: "选择星历月份", placement: "center", precision: "month", onChange: value => { selected = value; render() } })
  datePicker.element.querySelector(".site-date-trigger > svg")?.remove()
  const monthLabel = datePicker.element.querySelector<HTMLElement>(".site-date-trigger > span")!
  controls.append(prev, datePicker.element, next)
  const days = el("div", "", "attendance-details-days")
  days.setAttribute("aria-label", "选择日期")
  const weekdays = el("div", "", "attendance-details-weekdays")
  weekdays.setAttribute("aria-hidden", "true")
  for (const name of ["月", "火", "水", "木", "金", "土", "日"]) weekdays.append(el("span", name))
  const detail = el("div", "", "attendance-date-detail")
  detail.setAttribute("aria-live", "polite")
  body.append(controls, weekdays, days, detail)
  dialog.append(header, body)
  document.body.append(dialog)
  let selected = "",requestMonth="",requestVersion=0
  let snapshot:AttendanceMonth|undefined,error=""
  const controller=new AbortController()
  const loadMonth=(month:string)=>{
    if(requestMonth===month)return
    requestMonth=month;error="";snapshot=peekAttendanceMonth(month);const version=++requestVersion
    void readAttendanceMonth(month,controller.signal).then(value=>{
      if(controller.signal.aborted||version!==requestVersion)return
      snapshot=value;render()
    }).catch(()=>{if(!controller.signal.aborted&&version===requestVersion){error='星历数据暂时不可用';render()}})
  }
  const render = () => {
    if (!dialog.open) return
    const restoreDateFocus = days.contains(document.activeElement)
    const base=getState(),month=selected.slice(0,7)
    loadMonth(month)
    const state={...base,records:snapshot?.records||[],loaded:!!snapshot}

    datePicker.set(selected, `${state.earliest}-01`, new Date(Date.UTC(Number(state.latest.slice(0, 4)), Number(state.latest.slice(5)), 0)).toISOString().slice(0, 10))
    monthLabel.textContent = `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`
    prev.disabled = month <= state.earliest; next.disabled = month >= state.latest
    const record = state.records.find(row => row.date === selected)
    const status = record?.status || "empty"
    const previousHeight=detail.getBoundingClientRect().height
    if(previousHeight>0)detail.style.setProperty('--attendance-detail-height',`${previousHeight}px`)
    detail.dataset.status = status
    detail.setAttribute('aria-busy',String(!state.loaded&&!error))
    detail.classList.toggle('is-unavailable',!state.loaded&&Boolean(error))
    detail.replaceChildren()
    if (!state.loaded) {
      days.replaceChildren()
      const placeholder=el('div','','attendance-details-loading')
      placeholder.setAttribute('role','status')
      if(!error){const spinner=el('span','','activity-details-spinner');spinner.setAttribute('aria-hidden','true');placeholder.append(spinner)}
      placeholder.append(el('span',error||'正在读取日期记录…'))
      detail.append(placeholder)
      return
    }
    const symbol = el("span", "", "attendance-detail-star")
    symbol.setAttribute("aria-hidden", "true")
    symbol.innerHTML = '<svg viewBox="0 0 48 48" fill="currentColor"><path d="M24 3 28.5 19.5 45 24 28.5 28.5 24 45 19.5 28.5 3 24 19.5 19.5Z"/><path d="m24 14 2.5 7.5L34 24l-7.5 2.5L24 34l-2.5-7.5L14 24l7.5-2.5Z" fill="var(--light)"/></svg>'
    const title = el("div", "", "attendance-detail-heading")
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long", timeZone: "Asia/Shanghai" }).format(new Date(`${selected}T12:00:00+08:00`))
    title.append(el("strong", `${Number(selected.slice(5, 7))} 月 ${Number(selected.slice(8))} 日`), el("span", record?.specialName ? `✦ ${record.specialName}` : weekday, record?.specialName ? "attendance-detail-special" : ""))
    const mood = el("span", record?.bannerIcon || "", "attendance-detail-mood")
    if (record?.bannerIcon) {
      mood.setAttribute("role", "img")
      mood.setAttribute("aria-label", `当日表情：${record.bannerIcon}`)
    } else {
      mood.classList.add("is-empty")
      mood.setAttribute("aria-hidden", "true")
    }
    title.append(mood)
    const heading = el("div", "", "attendance-detail-hero")
    heading.append(symbol, title)
    detail.append(heading)
    const weather = el("div", "", "attendance-detail-weather")
    if (record?.weather) {
      const icon = el("span")
      icon.setAttribute("aria-hidden", "true")
      const cloud = '<path d="M6 17a4 4 0 0 1 0-8 6 6 0 0 1 11.6-1A4.5 4.5 0 0 1 18 17Z"/>'
      const symbol = /雪/.test(record.weather) ? `${cloud}<path d="M8 20h.01M12 21h.01M16 20h.01"/>`
        : /雨/.test(record.weather) ? `${cloud}<path d="m8 20-1 2m6-2-1 2m6-2-1 2"/>`
        : /阴|云|雾|霾/.test(record.weather) ? cloud
        : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
      icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${symbol}</svg>`
      weather.append(icon, el("span", record.weather.replace(/(?=[-−]?\d+(?:\.\d+)?\s*[℃°])/, " ").replace(/[~～]/g, " — ")))
    } else {
      weather.classList.add("is-empty")
      weather.setAttribute("aria-hidden", "true")
    }
    detail.append(weather)
    const stateName = record?.holidayName?.replace(/节$/, "") || labels[status] || (selected > state.today ? "待记录" : "暂无记录")
    const statusLine = el("div", stateName, "attendance-detail-status")
    const meta = el("div", "", "attendance-detail-meta")
    meta.append(statusLine)
    detail.append(meta)
    if (record?.location) {
      const place = el("div", "", "attendance-detail-location")
      const icon = el("span")
      icon.setAttribute("aria-hidden", "true")
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>'
      place.append(icon, el("span", record.location))
      meta.append(place)
    }
    days.replaceChildren()
    const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
    for (let day = 1; day <= last; day++) {
      const iso = `${month}-${String(day).padStart(2, "0")}`
      const entry = state.records.find(row => row.date === iso)
      const dayButton = document.createElement("button")
      dayButton.type = "button"; dayButton.textContent = String(day)
      const pending = !entry?.status && iso > state.today
      dayButton.disabled = pending
      if (day === 1) dayButton.style.gridColumnStart = String((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7 + 1)
      dayButton.dataset.status = entry?.status || "empty"
      if (entry?.specialName) {
        dayButton.classList.add("is-special")
        dayButton.title = entry.specialName
        const marker = el("span", "✦", "attendance-special-marker")
        marker.setAttribute("aria-hidden", "true")
        dayButton.append(marker)
      }
      dayButton.setAttribute("aria-label", `${iso} · ${labels[entry?.status || ""] || (pending ? "待记录" : "无记录")}${entry?.specialName ? ` · ${entry.specialName}` : ""}`)
      dayButton.setAttribute("aria-pressed", String(iso === selected))
      if (iso === state.today) dayButton.setAttribute("aria-current", "date")
      dayButton.addEventListener("click", () => { if (!dayButton.disabled) { selected = iso; render() } })
      days.append(dayButton)
    }
    if (restoreDateFocus) days.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true })
  }
  const open = (date?: string) => {
    const state = getState()
    selected = date || (state.today.startsWith(state.month) ? state.today : `${state.month}-01`)
    if (!dialog.open) showSiteDialog(dialog)
    button?.setAttribute("aria-expanded", "true")
    render()
  }
  const shift = (delta: number) => {
    const month = selected.slice(0, 7)
    const target = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + delta, 1)).toISOString().slice(0, 10)
    const state = getState()
    if (target.slice(0, 7) < state.earliest || target.slice(0, 7) > state.latest) return
    selected = target; render()
  }
  prev.addEventListener("click", () => shift(-1)); next.addEventListener("click", () => shift(1))
  close.addEventListener("click", () => dialog.close())
  dialog.addEventListener("close", () => { datePicker.close(); button?.setAttribute("aria-expanded", "false") })
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return
    const box = dialog.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close()
  })
  const click = () => open()
  button?.addEventListener("click", click)
  window.addCleanup(() => { controller.abort();requestVersion++;button?.removeEventListener("click", click); dialog.close(); dialog.remove() })
  return { open, refresh: render }
}
