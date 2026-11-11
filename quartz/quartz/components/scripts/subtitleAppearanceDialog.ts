import { showSiteDialog } from "./siteDialog"
import {
  normalizeSubtitleAppearance,
  subtitleAppearanceStyles,
  subtitleSizes,
  type SubtitleAppearance,
} from "./subtitleAppearance"

/** Shared dialog for the page and the isolated player's native fullscreen. */
export function openSubtitleAppearanceDialog(
  initial: unknown,
  changed: (value: SubtitleAppearance) => void,
  signal: AbortSignal,
  host: HTMLElement = document.body,
) {
  if (signal.aborted || document.querySelector("dialog.subtitle-appearance-dialog")) return
  let value = normalizeSubtitleAppearance(initial)
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "") => {
    const node = document.createElement(tag)
    node.textContent = text
    return node
  }
  const dialog = element("dialog")
  dialog.className = "subtitle-appearance-dialog"
  dialog.tabIndex = -1
  dialog.setAttribute("autofocus", "")
  dialog.setAttribute("aria-label", "字幕外观")
  const css = element("style")
  css.textContent = `
  .subtitle-appearance-dialog{--sa-bg:var(--q-surface,var(--light,#20242c));--sa-text:var(--q-text,var(--darkgray,#eee));--sa-muted:var(--q-muted,var(--gray,#a6aab3));--sa-border:var(--border,var(--lightgray,#454951));--sa-accent:var(--accent,var(--secondary,#79a6bb));box-sizing:border-box;width:min(450px,calc(100vw - 24px));height:fit-content!important;min-height:0!important;max-height:calc(100dvh - 32px);padding:0;border:1px solid var(--sa-border);border-radius:8px;background:var(--sa-bg);color:var(--sa-text);font:400 13px/1.45 system-ui,sans-serif;overflow:hidden;box-shadow:0 16px 60px #0005}
  dialog.subtitle-appearance-dialog[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto}
  .subtitle-appearance-dialog::backdrop{background:#0007}
  .subtitle-appearance-dialog *{box-sizing:border-box}
  .subtitle-appearance-dialog .sa-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--sa-border);gap:12px}
  .subtitle-appearance-dialog h2{font:600 16px/1.4 system-ui,sans-serif;margin:0;color:var(--sa-text)}
  .subtitle-appearance-dialog button{color:var(--sa-accent);background:transparent;border:0;cursor:pointer;font:inherit;padding:6px}
  .subtitle-appearance-dialog .sa-close{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px}
  .subtitle-appearance-dialog button:hover{background:color-mix(in srgb,var(--sa-accent) 10%,transparent)}
  .subtitle-appearance-dialog .sa-body{padding:12px 16px;min-height:0;max-height:none;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--sa-muted) transparent;scrollbar-gutter:stable}
  .subtitle-appearance-dialog .sa-preview{display:flex;align-items:center;justify-content:center;min-height:64px;padding:10px;border:1px solid var(--sa-border);border-radius:6px;background:linear-gradient(115deg,#ad60b3 0%,#7968be 40%,#329bc2 75%,#079fc4 100%);overflow:hidden;text-align:center}
  .subtitle-appearance-dialog .sa-preview-text{line-height:1.35;overflow-wrap:anywhere}
  .subtitle-appearance-dialog .sa-note,.subtitle-appearance-dialog small{display:block;color:var(--sa-muted);font-size:12px;line-height:1.6;margin:8px 0 12px}
  .subtitle-appearance-dialog form{display:grid;gap:9px;margin:0;padding:0}
  .subtitle-appearance-dialog label{display:grid;grid-template-columns:78px minmax(0,1fr);align-items:center;gap:10px;font-size:13px;color:var(--sa-text);margin:0}
  .subtitle-appearance-dialog select,.subtitle-appearance-dialog input[type=color]{display:block;width:100%;min-height:34px;padding:5px 9px;border:1px solid var(--sa-border);border-radius:6px;background:color-mix(in srgb,var(--sa-text) 5%,var(--sa-bg));color:var(--sa-text);font:inherit;font-size:14px;color-scheme:inherit}
  .subtitle-appearance-dialog select{appearance:none;padding-right:32px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%238b929b' stroke-width='1.7'%3E%3Cpath d='m3 5 4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
  .subtitle-appearance-dialog option{background:var(--sa-bg);color:var(--sa-text)}
  .subtitle-appearance-dialog input[type=range]{width:100%;accent-color:var(--sa-accent);margin:6px 0}
  .subtitle-appearance-dialog :is(button,select,input):focus-visible{outline:2px solid var(--sa-accent);outline-offset:2px}
  .subtitle-appearance-dialog .sa-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 16px;border-top:1px solid var(--sa-border);font-size:13px}
  .subtitle-appearance-dialog .sa-footer span{color:var(--sa-muted);font-size:12px}
  @media(max-width:600px){.subtitle-appearance-dialog{width:calc(100vw - 20px);max-height:calc(100dvh - 20px)}.subtitle-appearance-dialog .sa-header{padding:14px 16px}.subtitle-appearance-dialog .sa-body{padding:12px;min-height:0;max-height:none}.subtitle-appearance-dialog select{font-size:16px}.subtitle-appearance-dialog .sa-footer{padding:10px 16px}}
  dialog.subtitle-appearance-dialog > .sa-header,dialog.subtitle-appearance-dialog > .sa-footer{margin:0;min-height:0;height:auto}
  dialog.subtitle-appearance-dialog .sa-position{grid-template-columns:78px minmax(0,1fr) 24px}
  dialog.subtitle-appearance-dialog .sa-position output{font-variant-numeric:tabular-nums;text-align:right;color:var(--sa-muted)}
  @supports(appearance:base-select){
    .subtitle-appearance-dialog select,.subtitle-appearance-dialog select::picker(select){appearance:base-select}
    .subtitle-appearance-dialog select{display:flex;align-items:center;justify-content:space-between;background-image:none;padding-right:9px;cursor:pointer}
    .subtitle-appearance-dialog select::picker-icon{color:var(--sa-accent);transition:transform 150ms ease}
    .subtitle-appearance-dialog select:open::picker-icon{transform:rotate(180deg)}
    .subtitle-appearance-dialog select::picker(select){min-width:anchor-size(width);max-height:14rem;overflow:auto;margin-block:4px;padding:4px;border:1px solid var(--sa-border);border-radius:6px;background:var(--sa-bg);color:var(--sa-text);font:400 13px/1.5 system-ui,sans-serif;scrollbar-width:thin}
    .subtitle-appearance-dialog option{padding:5px 8px;border-radius:4px;gap:8px}
    .subtitle-appearance-dialog option:hover,.subtitle-appearance-dialog option:checked{background:color-mix(in srgb,var(--sa-accent) 12%,var(--sa-bg));color:var(--sa-accent)}
  }
  `
  const header = element("div"),
    heading = element("h2", "字幕外观"),
    close = element("button")
  close.type = "button"
  close.className = "sa-close"
  close.setAttribute("aria-label", "关闭字幕外观")
  close.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  header.className = "sa-header"
  header.append(heading, close)
  const body = element("div")
  body.className = "sa-body"
  const preview = element("div"),
    text = element("span", "这些设置仅影响该设备的字幕显示")
  preview.className = "sa-preview"
  text.className = "sa-preview-text"
  preview.append(text)
  const note = element("p", "以下设置不适用于图形字幕，以及嵌入自身样式的 ASS/SSA 字幕。")
  note.className = "sa-note"
  const form = element("form")
  form.addEventListener("submit", (event) => event.preventDefault())
  const inputs: { refresh: () => void }[] = []
  const render = () => {
    const styles = subtitleAppearanceStyles(value)
    Object.assign(text.style, styles, {
      fontSize: `${subtitleSizes[value.textSize]}em`,
      margin: "0px",
    })
    for (const input of inputs) input.refresh()
  }
  const update = () => {
    value = normalizeSubtitleAppearance(value)
    render()
    changed({ ...value })
  }
  const select = (
    labelText: string,
    key: "subtitleStyling" | "textSize" | "textWeight" | "font" | "dropShadow",
    choices: [string, string][],
  ) => {
    const label = element("label", labelText),
      input = element("select")
    for (const [id, name] of choices) {
      const option = element("option", name)
      option.value = id
      input.append(option)
    }
    label.append(input)
    form.append(label)
    inputs.push({
      refresh: () => {
        input.value = value[key]
      },
    })
    input.addEventListener("change", () => {
      ;(value as any)[key] = input.value
      update()
    })
  }
  select("字幕样式", "subtitleStyling", [
    ["Custom", "自定义"],
    ["Native", "原生"],
  ])
  select("文本大小", "textSize", [
    ["smaller", "更小"],
    ["small", "小"],
    ["normal", "正常"],
    ["large", "大"],
    ["larger", "更大"],
    ["extralarge", "特大"],
  ])
  select("文本粗细", "textWeight", [
    ["normal", "正常"],
    ["bold", "粗体"],
  ])
  select("字体", "font", [
    ["default", "默认"],
    ["typewriter", "打字机"],
    ["print", "印刷"],
    ["console", "控制台"],
    ["cursive", "草书"],
    ["casual", "休闲"],
    ["smallcaps", "小型大写字母"],
  ])
  const colorLabel = element("label", "文本颜色"),
    color = element("input")
  color.type = "color"
  colorLabel.append(color)
  form.append(colorLabel)
  inputs.push({
    refresh: () => {
      color.value = value.textColor
    },
  })
  color.addEventListener("input", () => {
    value.textColor = color.value
    update()
  })
  select("字体描边", "dropShadow", [
    ["", "阴影效果"],
    ["none", "无"],
    ["raised", "凸起"],
    ["depressed", "凹陷"],
    ["uniform", "均匀描边"],
  ])
  const positionLabel = element("label", "垂直位置"),
    range = element("input"),
    position = element("output")
  range.type = "range"
  range.min = "-10"
  range.max = "10"
  range.step = "1"
  range.setAttribute("aria-label", "字幕垂直位置")
  positionLabel.className = "sa-position"
  positionLabel.append(range, position)
  form.append(positionLabel)
  inputs.push({
    refresh: () => {
      range.value = String(value.verticalPosition)
      position.textContent = String(value.verticalPosition)
    },
  })
  range.addEventListener("input", () => {
    value.verticalPosition = Number(range.value)
    update()
  })

  body.append(preview, note, form)
  const footer = element("div"),
    reset = element("button", "恢复默认"),
    saved = element("span", "自动保存到当前浏览器")
  reset.type = "button"
  reset.addEventListener("click", () => {
    value = normalizeSubtitleAppearance()
    update()
  })
  footer.className = "sa-footer"
  footer.append(reset, saved)
  dialog.append(css, header, body, footer)
  host.append(dialog)
  close.addEventListener("click", () => dialog.close())
  const abort = () => {
    dialog.close()
    dialog.remove()
  }
  signal.addEventListener("abort", abort, { once: true })
  dialog.addEventListener(
    "close",
    () => {
      signal.removeEventListener("abort", abort)
      dialog.remove()
    },
    { once: true },
  )
  render()
  showSiteDialog(dialog)
  dialog.focus({ preventScroll: true })
}
