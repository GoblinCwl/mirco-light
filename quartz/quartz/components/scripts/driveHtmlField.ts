import { renderDriveMetadata } from "./driveMetadata"
import { node } from "./driveUi"
import { isTouchDialog } from "./siteDialog"

// One HTML editor/preview pair for share descriptions and metadata descriptions.
export function createDriveHtmlField(parent: HTMLElement, options: { label: string; value?: string; placeholder?: string; signal: AbortSignal; heading?: HTMLElement }) {
  const wrapper = node("div", "", "drive-html-field"), heading = options.heading || node("div", "", "drive-html-field-heading")
  const label = node("label", options.label), input = node("textarea"), preview = node("button", "预览 HTML"), output = node("div", "", "drive-html-preview")
  input.id = `drive-html-${crypto.randomUUID()}`; input.value = options.value || ""; input.placeholder = options.placeholder || "支持 HTML 内容"; input.rows = 5; label.htmlFor = input.id
  preview.type = "button"; preview.className = "drive-inline-action"
  output.id = `${input.id}-preview`; preview.setAttribute("aria-controls",`${input.id} ${output.id}`)
  output.setAttribute("role","region"); output.setAttribute("aria-label",`${options.label} HTML 预览`)
  if (options.heading) { label.className = "drive-field-label-hidden"; wrapper.append(label); heading.append(preview) }
  else { heading.append(label,preview); wrapper.append(heading) }
  let editing = false
  const render = () => {
    input.hidden = !editing; output.hidden = editing
    preview.textContent = editing ? "预览" : "编辑"
    preview.setAttribute("aria-label",`${preview.textContent}${options.label.replace("（可选）","")} HTML`)
    preview.setAttribute("aria-expanded",String(editing))
    if (!editing) {
      renderDriveMetadata(output,input.value); output.hidden = false
      if (!input.value.trim()) output.append(node("p","暂无预览内容","drive-action-note"))
    }
  }
  preview.addEventListener("click", () => {
    // Safari can keep the keyboard/visual viewport attached to a textarea
    // hidden by the toggle. Release it before changing the layout.
    if (editing) {
      input.blur()
      wrapper.closest<HTMLDialogElement>("dialog")?.focus({ preventScroll: true })
    }
    editing = !editing
    render()
    if (editing && !isTouchDialog()) input.focus({ preventScroll: true })
  }, { signal: options.signal })
  render()
  wrapper.append(input,output); parent.append(wrapper)
  return input
}
