import { node } from "./driveUi"
import { lockPageScroll } from "./pageScrollLock"
import { showSiteDialog, closeSiteDialog } from "./siteDialog"
import { showPasswordToast } from "./passwordFeedback"

export function setupRSSSubscription() {
  const trigger = document.querySelector<HTMLAnchorElement>(".home-profile-rss")
  if (!trigger) return
  const feedURL = new URL(trigger.href)
  const controller = new AbortController()
  const dialog = node("dialog", "", "activity-details rss-subscription-dialog")
  dialog.setAttribute("aria-label", "RSS 订阅")
  trigger.setAttribute("aria-haspopup", "dialog")
  trigger.setAttribute("aria-expanded", "false")
  const header = node("div", "", "activity-details-header")
  const close = node("button")
  close.type = "button"
  close.setAttribute("aria-label", "关闭")
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  header.append(node("strong", "RSS 订阅"), close)
  const body = node("div", "", "activity-details-body rss-subscription-body")
  const preview = node("div", "", "rss-subscription-preview")
  preview.setAttribute("aria-live", "polite")
  const address = node("span", feedURL.href, "rss-subscription-address")
  address.setAttribute("aria-label", "RSS 订阅地址")
  const actions = node("div", "", "rss-subscription-actions")
  const copy = node("button")
  const icon = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
  copy.innerHTML = icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>')
  const copyLabel = node("span", "复制")
  copy.append(copyLabel)
  copy.setAttribute("aria-label", "复制订阅链接")
  copy.type = "button"
  const open = node("a")
  open.innerHTML = icon('<path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>')
  open.append(node("span", "打开"))
  open.setAttribute("aria-label", "打开 RSS 链接（新窗口）")
  open.href = feedURL.href
  open.target = "_blank"
  open.rel = "noopener noreferrer"
  open.dataset.routerIgnore = "true"
  actions.append(copy, open)
  const footer = node("div", "", "rss-subscription-footer")
  footer.append(address, actions)
  const more = node("div", "", "rss-subscription-more")
  const layers = node("div", "", "rss-subscription-more-layers")
  layers.setAttribute("aria-hidden", "true")
  layers.append(node("span"), node("span"), node("span"))
  more.append(layers, node("span", "最新发布的20篇内容"))
  body.append(preview, more)
  dialog.append(footer)
  dialog.prepend(header, body)
  document.body.append(dialog)
  let loaded = false, loading = false, unlock: (() => void) | undefined
  const load = async () => {
    if (loaded || loading) return
    loading = true
    preview.replaceChildren(...Array.from({ length: 3 }, () => {
      const card = node("div", "", "rss-subscription-item rss-subscription-skeleton")
      card.setAttribute("aria-hidden", "true")
      card.append(node("strong"), node("time"), node("p"))
      return card
    }))
    preview.setAttribute("aria-label", "正在加载 RSS 预览")
    preview.setAttribute("aria-busy", "true")
    try {
      const response = await fetch(feedURL, { signal: controller.signal })
      if (!response.ok) throw new Error("RSS unavailable")
      const xml = new DOMParser().parseFromString(await response.text(), "application/xml")
      if (xml.querySelector("parsererror") || !xml.querySelector("channel")) throw new Error("Invalid RSS")
      const items = [...xml.querySelectorAll("channel > item")].slice(0, 3)
      preview.replaceChildren()
      for (const item of items) {
        const href = new URL(item.querySelector("link")?.textContent || "", feedURL)
        if (href.origin !== feedURL.origin || !/^https?:$/.test(href.protocol)) continue
        const card = node("a", "", "rss-subscription-item")
        card.href = href.href
        card.dataset.noPopover = "true"
        card.append(node("strong", item.querySelector("title")?.textContent || "未命名"))
        const date = new Date(item.querySelector("pubDate")?.textContent || "")
        if (!Number.isNaN(date.getTime())) {
          const time = node("time", date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }))
          time.dateTime = date.toISOString()
          card.append(time)
        }
        // Extract text in an inert template; never insert feed HTML or remote images.
        const template = document.createElement("template")
        template.innerHTML = item.querySelector("description")?.textContent || ""
        template.content.querySelectorAll("script,style").forEach(element => element.remove())
        const description = template.content.textContent?.replace(/\s+/g, " ").trim()
        card.append(node("p", description?.slice(0, 160) || ""))
        preview.append(card)
      }
      if (!preview.childElementCount) preview.textContent = "暂无更新"
      loaded = true
    } catch {
      if (controller.signal.aborted) return
      const retry = node("button", "预览加载失败，点击重试", "rss-subscription-retry")
      retry.type = "button"
      retry.onclick = () => void load()
      preview.replaceChildren(retry)
    } finally {
      loading = false
      preview.removeAttribute("aria-busy")
      preview.removeAttribute("aria-label")
    }
  }
  const show = (event: MouseEvent) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    event.stopPropagation()
    if (!dialog.open) { showSiteDialog(dialog); unlock = lockPageScroll() }
    trigger.setAttribute("aria-expanded", "true")
    void load()
  }
  trigger.addEventListener("click", show)
  close.onclick = () => void closeSiteDialog(dialog)
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(feedURL.href)
      showPasswordToast("已复制订阅链接")
    } catch {
      const range = document.createRange()
      range.selectNodeContents(address)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      showPasswordToast("请长按或使用复制快捷键复制链接", true)
    }
  }
  dialog.addEventListener("close", () => {
    if (dialog.open) return
    unlock?.(); unlock = undefined
    trigger.setAttribute("aria-expanded", "false")
  })
  let backdropPress = false
  const outside = (event: MouseEvent) => {
    const rect = dialog.getBoundingClientRect()
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
  }
  dialog.addEventListener("pointerdown", event => { backdropPress = outside(event) })
  dialog.addEventListener("pointercancel", () => { backdropPress = false })
  dialog.addEventListener("click", event => {
    if (backdropPress && outside(event)) void closeSiteDialog(dialog)
    backdropPress = false
  })
  window.addCleanup(() => {
    controller.abort()
    trigger.removeEventListener("click", show)
    dialog.close()
    unlock?.(); unlock = undefined
    dialog.remove()
  })
}
