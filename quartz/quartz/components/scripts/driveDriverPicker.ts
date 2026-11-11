import { node } from "./driveUi"

export function createDriveDriverPicker(names: string[], value: string, disabled: boolean, signal: AbortSignal, change: (name: string) => void, label = "存储驱动") {
  const element = node("div", "", "drive-driver-picker"), caption = node("span", label), trigger = node("button", value)
  const panel = node("div", "", "drive-driver-options"), search = node("input"), list = node("div", "", "drive-driver-list")
  trigger.type = "button"; trigger.disabled = disabled; trigger.setAttribute("role", "combobox"); trigger.setAttribute("aria-label", label)
  trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false")
  list.id = `drive-drivers-${crypto.randomUUID()}`; list.setAttribute("role", "listbox"); list.setAttribute("aria-label", label+"列表"); trigger.setAttribute("aria-controls", list.id)
  panel.hidden = true; search.type = "search"; search.placeholder = "输入名称筛选"; search.setAttribute("aria-label", "搜索"+label); search.autocomplete = "off"
  const close = () => { panel.hidden = true; trigger.setAttribute("aria-expanded", "false") }
  const render = () => {
    list.replaceChildren()
    for (const name of names.filter(name => name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))) {
      const option = node("button", name); option.type = "button"; option.setAttribute("role", "option"); option.setAttribute("aria-selected", String(name === value))
      option.addEventListener("click", () => { close(); change(name) }); list.append(option)
    }
    if (!list.children.length) list.append(node("p", "没有匹配项", "drive-action-note"))
  }
  trigger.addEventListener("click", () => {
    if (!panel.hidden) { close(); return }
    search.value = ""; render(); panel.hidden = false; trigger.setAttribute("aria-expanded", "true"); search.focus()
  })
  search.addEventListener("input", render)
  element.addEventListener("keydown", event => {
    if (panel.hidden) return
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); trigger.focus() }
    if (event.key === "Enter" && event.target === search) { event.preventDefault(); list.querySelector<HTMLButtonElement>("button")?.click() }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); const options = [...list.querySelectorAll<HTMLButtonElement>("button")], index = options.indexOf(document.activeElement as HTMLButtonElement)
      options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus()
    }
  })
  document.addEventListener("pointerdown", event => { if (!element.contains(event.target as Node)) close() }, { signal })
  panel.append(search, list); element.append(caption, trigger, panel)
  return { element, trigger }
}
