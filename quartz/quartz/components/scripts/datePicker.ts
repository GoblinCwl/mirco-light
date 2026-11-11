type Options = { label: string; placeholder?: string; clearable?: boolean; placement?: "center"; precision?: "month" | "datetime"; onChange: (value: string) => void }
const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/><path d="m12 13 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill="currentColor" stroke="none"/></svg>'
const iso = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
export function createDatePicker(options: Options) {
  const element = document.createElement("div")
  element.className = "site-date-field"
  const input = document.createElement("input")
  input.type = "hidden"
  const trigger = document.createElement("button")
  trigger.type = "button"; trigger.className = "site-date-trigger"
  trigger.setAttribute("aria-label", options.label); trigger.setAttribute("aria-haspopup", "dialog"); trigger.setAttribute("aria-expanded", "false")
  trigger.innerHTML = icon
  const text = document.createElement("span")
  trigger.append(text)
  const clear = document.createElement("button")
  clear.type = "button"; clear.className = "site-date-clear"; clear.textContent = "×"
  clear.setAttribute("aria-label", "清除日期")
  const popup = document.createElement("div")
  popup.className = "site-date-picker"; popup.setAttribute("popover", "auto")
  popup.setAttribute("role", "dialog"); popup.setAttribute("aria-label", options.label)
  const header = document.createElement("div")
  header.className = "site-date-picker-header"
  const previous = document.createElement("button"), next = document.createElement("button"), heading = document.createElement("button")
  for (const button of [previous, heading, next]) button.type = "button"
  previous.textContent = "‹"; next.textContent = "›"
  previous.setAttribute("aria-label", "上一段日期"); next.setAttribute("aria-label", "下一段日期")
  heading.className = "site-date-heading"
  const grid = document.createElement("div")
  header.append(previous, heading, next); popup.append(header, grid)
  element.append(input, trigger, clear, popup)
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  let min = "1900-01-01", max = "2099-12-31"
  let year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)) - 1
  let view: "days" | "months" | "years" = "days"
  const timeFields: HTMLSelectElement[] = []
  const sync = () => {
    text.textContent = input.value ? input.value.replaceAll("-", " / ").replace("T", "  ") : options.placeholder || "选择日期"
    clear.hidden = !options.clearable || !input.value
    trigger.classList.toggle("has-value", !!input.value)
    const parts = (input.value.split("T")[1] || "00:00:00").split(":")
    timeFields.forEach((field, index) => { field.value = parts[index] || "00" })
  }
  const close = () => { if (popup.matches(":popover-open")) popup.hidePopover() }
  const choose = (value: string) => {
    input.value = value && options.precision === "datetime" ? `${value}T${timeFields.map(field => field.value).join(":")}` : value
    sync(); options.onChange(input.value)
    if (options.precision !== "datetime" || !value) { close(); trigger.focus() }
    else render()
  }
  if (options.precision === "datetime") {
    const time = document.createElement("div"); time.className = "site-date-time"
    for (const [index, label] of ["小时", "分钟", "秒"].entries()) {
      const select = document.createElement("select"); select.setAttribute("aria-label", label)
      for (let value = 0; value < (index === 0 ? 24 : 60); value++) {
        const option = document.createElement("option"); option.value = option.textContent = String(value).padStart(2, "0"); select.append(option)
      }
      select.addEventListener("change", () => {
        input.value = `${input.value.slice(0, 10) || today}T${timeFields.map(field => field.value).join(":")}`
        sync(); options.onChange(input.value)
      })
      if (index) { const colon = document.createElement("span"); colon.textContent = ":"; time.append(colon) }
      timeFields.push(select); time.append(select)
    }
    const done = document.createElement("button"); done.type = "button"; done.textContent = "确定"; done.className = "site-date-confirm"
    done.addEventListener("click", () => { close(); trigger.focus() })
    time.append(done); popup.append(time)
  }
  const render = () => {
    grid.replaceChildren()
    grid.className = `site-date-picker-grid view-${view}`
    const minimumYear = Number(min.slice(0, 4)), maximumYear = Number(max.slice(0, 4))
    heading.textContent = view === "days" ? `${year} 年 ${month + 1} 月` : view === "months" ? `${year} 年` : `${Math.floor(year / 12) * 12} — ${Math.floor(year / 12) * 12 + 11}`
    heading.setAttribute("aria-label", view === "days" ? "选择月份" : "选择年份")
    const add = (label: string, disabled: boolean, action: () => void, selected = false) => {
      const button = document.createElement("button")
      button.type = "button"; button.textContent = label; button.disabled = disabled
      button.setAttribute("aria-pressed", String(selected)); button.addEventListener("click", action)
      grid.append(button); return button
    }
    if (view === "days") {
      const key = iso(year, month, 1).slice(0, 7)
      previous.disabled = key <= min.slice(0, 7); next.disabled = key >= max.slice(0, 7)
      for (const weekday of ["月", "火", "水", "木", "金", "土", "日"]) {
        const label = document.createElement("span"); label.textContent = weekday; label.className = "site-date-weekday"; grid.append(label)
      }
      const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      for (let day = 1; day <= count; day++) {
        const value = iso(year, month, day)
        const button = add(String(day), value < min || value > max, () => choose(value), value === input.value.slice(0, 10))
        button.setAttribute("aria-label", value)
        if (day === 1) button.style.gridColumnStart = String((new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7 + 1)
        if (value === today) button.setAttribute("aria-current", "date")
      }
    } else if (view === "months") {
      previous.disabled = year <= minimumYear; next.disabled = year >= maximumYear
      for (let index = 0; index < 12; index++) {
        const key = iso(year, index, 1).slice(0, 7)
        add(`${index + 1} 月`, key < min.slice(0, 7) || key > max.slice(0, 7), () => {
          month = index
          if (options.precision === "month") choose(iso(year, month, 1))
          else { view = "days"; render() }
        }, index === month)
      }
    } else {
      const start = Math.floor(year / 12) * 12
      previous.disabled = start <= minimumYear; next.disabled = start + 11 >= maximumYear
      for (let index = start; index < start + 12; index++) add(String(index), index < minimumYear || index > maximumYear, () => { year = index; view = "months"; render() }, index === year)
    }
  }
  const position = () => {
    if (!popup.matches(":popover-open")) return
    if (options.placement === "center") {
      popup.style.left = `${Math.max(8, (window.innerWidth - popup.offsetWidth) / 2)}px`
      popup.style.top = `${Math.max(8, (window.innerHeight - popup.offsetHeight) / 2)}px`
      return
    }
    const rect = trigger.getBoundingClientRect(), height = popup.offsetHeight
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - popup.offsetWidth - 8, rect.right - popup.offsetWidth))}px`
    popup.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, rect.bottom + 8 + height <= window.innerHeight ? rect.bottom + 8 : rect.top - height - 8))}px`
  }
  const refresh = () => { render(); position() }
  trigger.addEventListener("click", () => {
    if (popup.matches(":popover-open")) { close(); return }
    const value = input.value || (today < min ? min : today > max ? max : today)
    year = Number(value.slice(0, 4)); month = Number(value.slice(5, 7)) - 1; view = options.precision === "month" ? "months" : "days"
    render(); popup.showPopover(); position()
    const selected = grid.querySelector<HTMLButtonElement>('[aria-pressed="true"]:not(:disabled)') || grid.querySelector<HTMLButtonElement>("button:not(:disabled)")
    selected?.focus({ preventScroll: true })
  })
  popup.addEventListener("toggle", () => trigger.setAttribute("aria-expanded", String(popup.matches(":popover-open"))))
  popup.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); trigger.focus(); return }
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const offset = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: view === "days" ? 7 : 3, ArrowUp: view === "days" ? -7 : -3 } as Record<string, number>)[event.key]
    if (offset !== undefined && index >= 0) { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + offset))]?.focus() }
  })
  const shift = (direction: number) => {
    if (view === "days") { const date = new Date(Date.UTC(year, month + direction, 1)); year = date.getUTCFullYear(); month = date.getUTCMonth() }
    else year += direction * (view === "years" ? 12 : 1)
    refresh()
  }
  previous.addEventListener("click", () => shift(-1)); next.addEventListener("click", () => shift(1))
  heading.addEventListener("click", () => { view = view === "days" ? "months" : view === "months" ? "years" : "months"; refresh() })
  clear.addEventListener("click", () => choose(""))
  window.addEventListener("resize", position)
  // The field is attached after construction; capture ancestor scrolls while the popup is open.
  document.addEventListener("scroll", position, true)
  const dispose = () => { close(); window.removeEventListener("resize", position); document.removeEventListener("scroll", position, true) }
  window.addCleanup(dispose)
  sync()
  return { element, input, dispose, set(value: string, minimum = min, maximum = max) { input.value = value; min = minimum; max = maximum; sync() }, close }
}
