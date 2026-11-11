import { driveRequest, driveToken } from "./driveClient"
import { driveActionDialog } from "./driveActionDialog"
import { node } from "./driveUi"
export type ManagementDialog = ReturnType<typeof driveActionDialog>
export function managementSession(ui: ManagementDialog, parent: AbortSignal, token: string) {
  ui.dialog.classList.add("drive-management-dialog")
  const controller = new AbortController(), signal = AbortSignal.any([parent, controller.signal])
  ui.dialog.addEventListener("close", () => controller.abort(), { once: true })
  document.addEventListener("drive-auth-change", () => { if (token !== driveToken()) { controller.abort(); ui.dialog.close() } }, { signal })
  return { signal, async api<T>(route: string, body?: object) {
    signal.throwIfAborted()
    if (!token || token !== driveToken()) throw new Error("登录状态已变化，请重新操作")
    const result = await driveRequest<T>(route, body, { token, signal })
    signal.throwIfAborted()
    if (token !== driveToken()) throw new Error("登录状态已变化，请重新操作")
    return result
  } }
}
export function managementButton(label: string, action: () => void, danger = false) {
  const button = node("button", label); button.type = "button"
  if (danger) button.classList.add("is-danger")
  button.addEventListener("click", action)
  return button
}
export function managementCheck(label: string, checked = false) {
  const wrapper = node("label", "", "drive-management-check"), input = node("input")
  input.type = "checkbox"; input.checked = checked; wrapper.append(input, node("span", label))
  return { wrapper, input }
}
export function managementSwitch(label: string, checked: boolean) {
  const wrapper = node("label", "", "drive-management-switch"), input = node("input"), state = node("span")
  input.type = "checkbox"; input.setAttribute("role", "switch"); input.setAttribute("aria-label", label); input.checked = checked
  const update = () => { state.textContent = input.checked ? "启用" : "停用"; wrapper.title = `${label}：${input.checked ? "已启用" : "已停用"}` }
  input.addEventListener("change", update); update(); wrapper.append(input, state)
  return { wrapper, input, update }
}
export async function readManagementPages<T>(api: <R>(route: string, body?: object) => Promise<R>, path: string) {
  const items: T[] = []
  for (let page = 1; ; page++) {
    const result = await api<{ content: T[] | null; total: number }>(`${path}?page=${page}&per_page=100`)
    const entries = result.content || []; items.push(...entries)
    if (!entries.length || items.length >= result.total) return items
  }
}
export function confirmManagement(title: string, message: string, signal: AbortSignal, action: () => Promise<void>) {
  const ui = driveActionDialog(title, signal); ui.note(message); ui.submit.textContent = "确认"
  ui.submit.classList.add("is-danger"); ui.run(action)
}

export function setManagementBack(ui: ManagementDialog, action?: () => void) {
  ui.header.querySelector(".drive-management-back")?.remove()
  if (action) { const button = managementButton("返回列表", action); button.classList.add("drive-management-back"); ui.header.append(button) }
}
