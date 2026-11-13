import { lockPageScroll } from "./pageScrollLock"

export type LoginPanel = HTMLElement & { readonly open: boolean; show(): void; close(): void }

export function prepareLoginPanel(panel: HTMLElement, signal: AbortSignal): LoginPanel {
  const home = document.createComment("login panel position")
  panel.before(home)
  // Move once, before setup creates inputs. Autofill targets never move on open/close.
  document.body.append(panel)
  const dialog = panel as LoginPanel
  Object.defineProperty(dialog, "open", { get: () => !dialog.hidden })
  dialog.show = () => { dialog.hidden = false; dialog.setAttribute("open", "") }
  dialog.close = () => {
    if (!dialog.open) return
    dialog.hidden = true; dialog.removeAttribute("open")
    dialog.dispatchEvent(new Event("close"))
  }
  signal.addEventListener("abort", () => { dialog.close(); home.replaceWith(dialog) }, { once: true })
  return dialog
}

// Keep the login outside the browser top layer so password-manager popovers
// can appear above it without repeatedly promoting themselves over a modal.
export function showLoginDialog(dialog: LoginPanel) {
  if (dialog.open) return
  const opener = document.activeElement as HTMLElement | null
  const backdrop = document.createElement("div")
  backdrop.className = "stellar-login-backdrop"
  const root = document.getElementById("quartz-root")
  const previousInert = root?.inert
  document.body.append(backdrop)
  dialog.dataset.inlineLogin = ""
  dialog.setAttribute("aria-modal", "true")
  dialog.show()
  if (root) root.inert = true
  const unlock = lockPageScroll()
  const dismiss = () => {
    if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close()
  }
  backdrop.addEventListener("click", dismiss)
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented || document.querySelector(":popover-open")) return
    event.preventDefault()
    dismiss()
  }
  dialog.addEventListener("keydown", escape)
  dialog.addEventListener("close", () => {
    dialog.removeEventListener("keydown", escape)
    backdrop.remove()
    delete dialog.dataset.inlineLogin
    dialog.removeAttribute("aria-modal")
    if (root) root.inert = previousInert ?? false
    unlock()
    if (opener?.isConnected) opener.focus({ preventScroll: true })
  }, { once: true })
  dialog.focus({ preventScroll: true })
}
