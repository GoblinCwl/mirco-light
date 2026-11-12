import {readContentCatalog} from './contentCatalog'
import {domainDistribution} from './domainDistribution'
import { showSiteDialog, closeSiteDialog } from "./siteDialog"
export function setupDomainDetails() {
  const button = document.querySelector<HTMLButtonElement>("[data-domain-details]")
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".home-star-domains .home-explore-item")]
  if (!button || !links.length) return
  const element = (tag: string, text = "", className = "") => {
    const node = document.createElement(tag)
    node.textContent = text
    if (className) node.className = className
    return node
  }
  const dialog = document.createElement("dialog")
  dialog.className = "activity-details domain-details"
  dialog.setAttribute("aria-label", "星域 · 内容分布")
  const header = element("div", "", "activity-details-header")
  header.append(element("strong", "星域 · 内容分布"))
  const close = document.createElement("button")
  close.type = "button"; close.setAttribute("aria-label", "关闭星域统计")
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  header.append(close)
  const body = element("div", "", "domain-details-body")
  dialog.append(header, body)
  document.body.append(dialog)
  let disposed = false, ready = false
  const open = async () => {
    if (dialog.open) return
    showSiteDialog(dialog); button.setAttribute("aria-expanded", "true")
    if (!ready) {
      const loading = element("div", "", "visitor-details-loading domain-details-loading")
      loading.append(element("span", "", "activity-details-spinner"), element("span", "正在汇集星域内容…"))
      body.replaceChildren(loading)
    }
    body.setAttribute("aria-busy", "true")
    try {
      const catalog = await readContentCatalog()
      if (disposed) return
      const groups = links.map(link => {
        const prefix = decodeURIComponent(new URL(link.href).pathname).replace(/^\/+|\/+$/g, "")
        return { link, ...domainDistribution(catalog,prefix), label: link.querySelector("strong")?.textContent || prefix }
      })
      groups.sort((a, b) => b.count - a.count)
      const total = groups.reduce((sum, group) => sum + group.count, 0)
      const maximum = Math.max(1, ...groups.map(group => group.count))
      const summary = element("div", "", "domain-details-summary")
      summary.append(
        element("strong", String(total)),
        element("span", "项内容 ·"),
        element("strong", String(groups.length)),
        element("span", "个星域"),
      )
      const chart = element("div", "", "domain-details-chart")
      chart.style.setProperty("--domain-count", String(groups.length))
      chart.setAttribute("aria-label", "各星域内容数量，按数量从多到少排列")
      for (const group of groups) {
        const row = document.createElement("a")
        row.className = "domain-details-row"; row.href = group.link.href; row.target = "_blank"; row.rel = "noopener noreferrer"
        const color = getComputedStyle(group.link).getPropertyValue("--star-domain-color").trim() || "#668caa"
        row.style.setProperty("--domain-color", color)
        row.style.setProperty("--star-domain-color", color)
        const track = element("div", "", "domain-details-track")
        const fill = element("span", "", "domain-details-bar")
        fill.style.height = `${group.count / maximum * 100}%`
        fill.append(element("span", String(group.count), "domain-details-count"))
        track.append(fill)
        const share = total ? Math.round(group.count / total * 100) : 0
        row.append(track, element("strong", group.label, "domain-details-label"), element("span", `${share}%`, "domain-details-share"))
        row.setAttribute("aria-label", `${group.label}：${group.count} ${group.unit}，占 ${share}%，打开星域`)
        chart.append(row)
      }
      body.replaceChildren(summary, chart)
      ready = true
    } catch { if (!disposed) body.replaceChildren(element("p", "星域统计暂不可用，请稍后重试")) }
    finally { if (!disposed) body.setAttribute("aria-busy", "false") }
  }
  const click = () => { void open() }
  button.addEventListener("click", click)
  close.addEventListener("click", () => void closeSiteDialog(dialog))
  dialog.addEventListener("close", () => {if(!dialog.open)button.setAttribute("aria-expanded", "false")})
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) void closeSiteDialog(dialog)
  })
  window.addCleanup(() => { disposed = true; button.removeEventListener("click", click); dialog.close(); dialog.remove() })
}
