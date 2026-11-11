import { attachDriveDirectoryPicker } from "./driveDirectoryPicker"
import { normalizeDrivePath } from "./openlistShared"
import { node } from "./driveUi"
import type { driveActionDialog } from "./driveActionDialog"

export function setupDriveSharePaths(ui: ReturnType<typeof driveActionDialog>, paths: string[], options: { signal: AbortSignal; token: string; basePath?: string }) {
  const section = node("section", "", "drive-share-paths"), heading = node("div", "", "drive-html-field-heading")
  const add = node("button", "添加路径", "drive-inline-action"), rows = node("div", "", "drive-share-path-list")
  add.type = "button"; heading.append(node("span", "分享路径"), add); section.append(heading, rows); ui.body.append(section)
  const entries: { input: HTMLInputElement; element: HTMLElement; remove: HTMLButtonElement }[] = []
  const update = () => { entries.forEach((entry, i) => { entry.input.setAttribute("aria-label", `分享路径 ${i + 1}`); entry.remove.disabled = entries.length === 1 }) }
  const append = (value: string) => {
    const input = ui.field("路径", value)
    input.required = true; input.placeholder = "/目录/文件或文件夹"
    const picker = attachDriveDirectoryPicker(input, { ...options, absolute: true, includeFiles: true })
    const row = node("div", "", "drive-share-path-row"), remove = node("button", "移除", "drive-inline-action")
    remove.type = "button"; remove.setAttribute("aria-label", "移除此分享路径")
    row.append(picker.element, remove); rows.append(row)
    const entry = { input, element: row, remove }; entries.push(entry)
    remove.addEventListener("click", () => { if (entries.length < 2) return; picker.dispose(); row.remove(); entries.splice(entries.indexOf(entry), 1); update() }, { signal: options.signal })
    update()
    return input
  }
  for (const path of paths) append(path)
  add.addEventListener("click", () => append("").focus(), { signal: options.signal })
  return () => {
    const result = entries.map(({ input }) => {
      const value = input.value.trim()
      if (!value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) throw new Error("请填写有效的绝对分享路径")
      return normalizeDrivePath(value)
    })
    if (!result.length || result.some(path => !path)) throw new Error("请至少设置一个分享路径")
    if (new Set(result).size !== result.length) throw new Error("分享路径不能重复")
    return result
  }
}
