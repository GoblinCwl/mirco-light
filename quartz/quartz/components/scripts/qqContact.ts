import { showSiteDialog } from "./siteDialog"
export function setupQQContact() {
  const link = document.querySelector<HTMLAnchorElement>("[data-home-qq-contact]")
  if (!link) return
  const dialog = document.createElement("dialog")
  dialog.className = "activity-details qq-contact-dialog"
  dialog.setAttribute("aria-label", "与我联系")
  const header = document.createElement("div")
  header.className = "activity-details-header"
  const title = document.createElement("strong")
  title.textContent = "与我联系"
  const close = document.createElement("button")
  close.type = "button"
  close.setAttribute("aria-label", "关闭")
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  header.append(title, close)
  const content = document.createElement("div")
  content.className = "qq-contact-content"
  const image = document.createElement("img")
  image.src = link.dataset.qqQrCode ?? "/static/qq-add.svg"
  image.alt = "使用手机 QQ 扫码添加好友"
  image.width = image.height = 200
  image.draggable = false
  image.setAttribute("no-view", "")
  const number = document.createElement("div")
  number.className = "qq-contact-number"
  number.textContent = `QQ ${link.dataset.qq ?? ""}`
  const add = document.createElement("a")
  add.className = "qq-contact-add"
  add.href = link.href
  add.target = "_blank"
  add.rel = "noopener noreferrer"
  add.textContent = "添加 QQ"
  content.append(image, number, add)
  dialog.append(header, content)
  document.body.append(dialog)
  const open = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    number.textContent = `QQ ${link.dataset.qq ?? ""}`
    add.href = link.href
    if (!dialog.open) showSiteDialog(dialog)
    link.setAttribute("aria-expanded", "true")
  }
  link.addEventListener("click", open)
  close.addEventListener("click", () => dialog.close())
  dialog.addEventListener("close", () => link.setAttribute("aria-expanded", "false"))
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
  })
  window.addCleanup(() => {
    link.removeEventListener("click", open)
    dialog.close()
    dialog.remove()
  })
}
