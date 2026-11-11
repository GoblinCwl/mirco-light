import { drivePassword, type DriveView } from "./driveClient"
import type { DriveFile } from "./openlistShared"
import type { driveActionDialog } from "./driveActionDialog"
import { buildRenamePlan, type RenameChange, type RenameFile, type RenameMode } from "./driveRename"
import { node } from "./driveUi"

type API = <T>(route: string, body: object) => Promise<T>
export function setupBatchRename(ui: ReturnType<typeof driveActionDialog>, items: RenameFile[], options: {
  srcDir: string; view: DriveView; share: string; api: API
  validName: (value: string) => string
  commit: (route: string, body: object) => Promise<void>
}) {
  if (!items.length) throw new Error("请先选择要批量重命名的文件或文件夹")
  let mode: RenameMode = "regex", previewing = false, plan: RenameChange[] = []
  const scope = node("p", `已选择 ${items.length} 项，仅修改所选项目`, "drive-action-note")
  const rules = node("div", "", "drive-rename-rules"), modes = node("div", "", "drive-rename-modes")
  modes.setAttribute("role", "radiogroup"); modes.setAttribute("aria-label", "重命名方式")
  const help = node("p", "", "drive-action-note")
  rules.append(modes, help); ui.body.append(scope, rules)
  const field = (label: string, value = "", type = "text") => {
    const input = ui.field(label, value, type); rules.append(input.closest("label")!); return input
  }
  const source = field("正则表达式"), replacement = field("替换内容"), padding = field("序号位数（0 为不补零）", "0", "number")
  source.required = true; padding.min = "0"; padding.max = "128"; padding.step = "1"
  const preview = node("div", "", "drive-rename-preview"); preview.hidden = true; ui.body.append(preview)
  const back = node("button", "返回修改规则"); back.type = "button"; back.hidden = true
  ui.submit.before(back); ui.submit.textContent = "预览"; ui.submit.disabled = true
  const relabel = (input: HTMLInputElement, label: string) => { input.closest("label")!.firstChild!.textContent = label }
  const update = () => {
    ui.clearError()
    const sequential = mode === "sequence"
    padding.closest("label")!.hidden = !sequential
    padding.disabled = !sequential
    relabel(source, sequential ? "名称模板／前缀" : mode === "regex" ? "正则表达式" : "查找内容")
    relabel(replacement, sequential ? "起始序号" : "替换内容")
    replacement.type = sequential ? "number" : "text"; replacement.min = sequential ? "0" : ""; replacement.step = "1"
    replacement.required = mode !== "regex"
    help.textContent = sequential ? "按当前列表顺序编号，保留扩展名。使用 {number} 指定序号位置；没有占位符时，序号追加到前缀后。" : mode === "regex" ? "对匹配文件名进行全局替换，支持 $1、$2 等分组，以及 {created_year}、{modified_month} 等时间占位符。" : "查找文件名中的文字，只替换首次出现的位置。"
    ui.submit.disabled = !source.value || mode !== "regex" && !replacement.value
    if (source.value) {
      try {
        if (mode !== "regex") options.validName(source.value)
        if (mode === "replace" && replacement.value) options.validName(replacement.value)
        buildRenamePlan(items, { mode, source: source.value, replacement: replacement.value, padding: padding.value })
      } catch (error) { ui.fail(error instanceof Error ? error.message : "规则无效"); ui.submit.disabled = true }
    }
  }
  for (const [value, text] of [["regex", "正则"], ["sequence", "顺序"], ["replace", "查找和替换"]] as const) {
    const label = node("label"), radio = node("input"); radio.type = "radio"; radio.name = "drive-rename-mode"; radio.value = value; radio.checked = mode === value
    label.append(radio, node("span", text)); modes.append(label)
    radio.addEventListener("change", () => { if (radio.checked) { mode = value; update() } })
  }
  for (const input of [source, replacement, padding]) input.addEventListener("input", update)
  const showPreview = () => {
    try {
      plan = buildRenamePlan(items, { mode, source: source.value, replacement: replacement.value, padding: padding.value })
      for (const item of plan) options.validName(item.new_name)
      const finalNames = items.map(item => plan.find(change => change.src_name === item.name)?.new_name ?? item.name)
      if (new Set(finalNames).size !== finalNames.length) throw new Error("修改后的名称重复，请调整规则")
      preview.replaceChildren()
      const header = node("div", "", "drive-rename-preview-row is-heading"); header.append(node("span", "原名称"), node("span", "新名称")); preview.append(header)
      for (const item of plan) {
        const row = node("div", "", "drive-rename-preview-row"), oldName = node("span", item.src_name), newName = node("span", item.new_name)
        oldName.title = item.src_name; newName.title = item.new_name; row.append(oldName, newName); preview.append(row)
      }
      if (!plan.length) preview.append(node("p", "没有匹配的项目", "drive-action-note"))
      previewing = true; rules.hidden = true; preview.hidden = false; back.hidden = false
      scope.textContent = `已选择 ${items.length} 项，匹配 ${plan.length} 项`
      ui.clearError(); ui.submit.textContent = "确认重命名"; ui.submit.disabled = !plan.some(item => item.src_name !== item.new_name)
    } catch (error) { ui.fail(error instanceof Error ? error.message : "无法生成预览")}
  }
  back.addEventListener("click", () => {
    previewing = false; rules.hidden = false; preview.hidden = true; back.hidden = true
    scope.textContent = `已选择 ${items.length} 项，仅修改所选项目`; ui.submit.textContent = "预览"; update()
  })
  ui.dialog.querySelector("form")!.addEventListener("submit", event => {
    if (previewing) return
    event.preventDefault(); event.stopImmediatePropagation(); showPreview()
  }, { capture: true })
  ui.run(async () => {
    if (!previewing) throw new Error("请先预览重命名结果")
    const objects = plan.filter(item => item.src_name !== item.new_name)
    if (!objects.length) throw new Error("没有需要修改的名称")
    const existing = await options.api<{ content: DriveFile[] | null }>("fs/list", { path: options.srcDir, password: drivePassword(options.view, options.share, options.srcDir), page: 1, per_page: 0, refresh: true })
    const known = new Set((existing.content || []).map(item => item.name))
    for (const item of objects) {
      options.validName(item.new_name)
      if (!known.has(item.src_name)) throw new Error(`${item.src_name} 已不存在，请刷新目录后重试`)
      if (known.has(item.new_name)) throw new Error(`${item.new_name} 已存在，请返回修改规则；不能直接互换名称`)
    }
    await options.commit("fs/batch_rename", { src_dir: options.srcDir, rename_objects: objects })
  })
  update()
}
