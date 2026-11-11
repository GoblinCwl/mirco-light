import {showPasswordToast} from './passwordFeedback'
import { showSiteDialog } from "./siteDialog"
import { createDatePicker } from "./datePicker"
import { node } from "./driveUi"

export function driveActionDialog(title: string, signal: AbortSignal) {
  const dialog = node("dialog", "", "drive-action-dialog"), form = node("form")
  const heading = node("h2", title), header = node("header", "", "drive-action-header"), body = node("div", "", "drive-action-body")
  header.append(heading)
  const footer = node("div", "", "drive-action-footer"), cancel = node("button", "取消"), submit = node("button", "确定")
  cancel.type = "button"; submit.type = "submit"; submit.className = "drive-action-submit"
  footer.append(cancel, submit); form.append(header, body, footer); dialog.append(form)
  dialog.setAttribute("aria-label", title); document.body.append(dialog)
  form.addEventListener("submit", event => event.preventDefault())
  let busy = false,lastError=""
  const close = () => { if (!busy) dialog.close() }
  cancel.addEventListener("click", close)
  const outside = (event: MouseEvent) => {
    if (event.target !== dialog) return false
    const box = dialog.getBoundingClientRect()
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
  }
  let backdropPress = false
  dialog.addEventListener("pointerdown", event => { backdropPress = outside(event) })
  dialog.addEventListener("pointercancel", () => { backdropPress = false })
  dialog.addEventListener("click", event => {
    if (backdropPress && outside(event)) close()
    backdropPress = false
  })
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault() })
  dialog.addEventListener("close", () => dialog.remove(), { once: true })
  const abort = () => { dialog.close(); dialog.remove() }
  signal.addEventListener("abort", abort, { once: true })
  dialog.addEventListener("close", () => signal.removeEventListener("abort", abort), { once: true })
  showSiteDialog(dialog)
  return {
    body, submit, cancel, dialog, header,
    clearError(){lastError=""},
    fail(message:string){if(!message){lastError="";return}if(!signal.aborted&&message!==lastError){lastError=message;showPasswordToast(message,true)}},
    field(label: string, value = "", type = "text") {
      const wrapper = node("label", label)
      if (type === "datetime-local") {
        const picker = createDatePicker({ label, placeholder: "选择到期时间", clearable: true, precision: "datetime", onChange: () => {} })
        picker.set(value)
        wrapper.append(picker.element); body.append(wrapper)
        dialog.addEventListener("close", picker.dispose, { once: true })
        return picker.input
      }
      const input = node("input")
      input.type = type; input.value = value; wrapper.append(input); body.append(wrapper); return input
    },
    note(text: string) { body.append(node("p", text, "drive-action-note")) },
    run(action: () => Promise<void>, options: { closeOnSuccess?: boolean } = {}) {
      form.addEventListener("submit", async event => {
        event.preventDefault(); if (busy || !form.reportValidity()) return
        busy = true; lastError = ""; const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>("input,button,select,textarea")]
        const disabled = controls.map(control => control.disabled)
        controls.forEach(control => control.disabled = true); submit.setAttribute("aria-busy", "true")
        const label = submit.textContent; submit.textContent = "处理中…"
        try { await action(); if (!signal.aborted && options.closeOnSuccess !== false) { busy = false; dialog.close() } }
        catch (reason) { if (!signal.aborted) showPasswordToast(reason instanceof Error ? reason.message : "操作失败，请重试",true) }
        finally { busy = false; controls.forEach((control, i) => control.disabled = disabled[i]); submit.textContent = label; submit.removeAttribute("aria-busy") }
      })
    },
  }
}
