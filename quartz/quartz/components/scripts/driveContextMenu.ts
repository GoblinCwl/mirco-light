import { node } from "./driveUi"

type ContextActions = { name: string; buttons: HTMLButtonElement[]; prepare?:()=>Promise<void>; execute: (kind: string) => Promise<void> }
export function setupDriveContextMenu(listing: HTMLElement, signal: AbortSignal, resolve: (target: Element) => ContextActions | undefined) {
  const menu = node("div", "", "drive-context-menu")
  menu.setAttribute("role", "menu"); menu.tabIndex = -1; menu.hidden = true
  menu.setAttribute("popover", "manual"); document.body.append(menu)
  let origin: HTMLElement | undefined,version=0
  const close = (restore = false) => {
    version++
    if (menu.hidden) return
    if (menu.matches(":popover-open")) menu.hidePopover()
    menu.hidden = true; menu.replaceChildren()
    if (restore && origin?.isConnected) origin.focus({ preventScroll: true })
  }
  const listen = (target: EventTarget, type: string, handler: EventListener, capture = false) => target.addEventListener(type, handler, { signal, capture })
  const focusable = () => [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
  listen(listing, "contextmenu", async event => {
    const mouse = event as MouseEvent, target = event.target
    close()
    if (!(target instanceof Element)) return
    const actions = resolve(target)
    if (!actions?.buttons.length) return
    event.preventDefault()
    const own=version
    if(actions.prepare){try{await actions.prepare()}catch{return};if(signal.aborted||own!==version)return}
    origin = target.closest<HTMLElement>("a,button,input") || undefined
    menu.setAttribute("aria-label", `${actions.name}的操作`)
    for (const source of actions.buttons) {
      const button = source.cloneNode(true) as HTMLButtonElement
      const kind = button.dataset.operation!
      delete button.dataset.operation; button.dataset.contextOperation = kind
      button.setAttribute("role", "menuitem"); button.tabIndex = -1
      button.addEventListener("click", () => { close(); void actions.execute(kind) }, { signal })
      menu.append(button)
    }
    menu.hidden = false
    if (typeof menu.showPopover === "function") menu.showPopover()
    const bounds = menu.getBoundingClientRect(), margin = 8
    menu.style.left = `${Math.max(margin, Math.min(mouse.clientX, innerWidth - bounds.width - margin))}px`
    menu.style.top = `${Math.max(margin, Math.min(mouse.clientY, innerHeight - bounds.height - margin))}px`
    ;(focusable()[0] || menu).focus({ preventScroll: true })
  })
  listen(document, "pointerdown", event => { if (!menu.contains(event.target as Node)) close() }, true)
  listen(document, "contextmenu", event => { if (!listing.contains(event.target as Node)) close() }, true)
  listen(document, "keydown", event => {
    if (menu.hidden) {if((event as KeyboardEvent).key==='Escape')close();return}
    const key = event as KeyboardEvent
    if (key.key === "Escape" || key.key === "Tab") { if (key.key === "Escape") key.preventDefault(); close(true); return }
    const buttons = focusable(), index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key.key) || !buttons.length) return
    key.preventDefault()
    const next = key.key === "Home" ? 0 : key.key === "End" ? buttons.length - 1 : (index + (key.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length
    buttons[next].focus()
  })
  listen(document, "scroll", event => { if (!menu.contains(event.target as Node)) close() }, true)
  listen(window, "resize", () => close())
  listen(document, "drive-auth-change", () => close())
  signal.addEventListener("abort", () => { close(); menu.remove() }, { once: true })
  return close
}
