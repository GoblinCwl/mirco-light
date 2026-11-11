import { showSiteDialog } from "./siteDialog"
export type ActivityCategory = {
  name: string; seconds: number; percent: number; color: string
  apps?: { name: string; seconds: number }[]
}

const duration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return `${Math.round(seconds)} 秒`
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`
}

export function createActivityCategoryDetails() {
  const node = (tag: string, text = "", className = "") => {
    const element = document.createElement(tag)
    element.textContent = text
    element.className = className
    return element
  }
  const dialog = document.createElement("dialog")
  dialog.className = "activity-details activity-category-details"
  const header = node("div", "", "activity-details-header")
  const title = node("strong")
  const close = document.createElement("button")
  close.type = "button"
  close.setAttribute("aria-label", "关闭分类应用明细")
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  header.append(title, close)
  const body = node("div", "", "activity-details-body")
  dialog.append(header, body)
  document.body.append(dialog)
  let trigger: HTMLElement | undefined
  close.addEventListener("click", () => dialog.close())
  dialog.addEventListener("close", () => trigger?.setAttribute("aria-expanded", "false"))
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
  })
  window.addCleanup(() => { dialog.close(); dialog.remove() })
  return {
    open(category: ActivityCategory, period: { startDate: string; endDate: string }, source: HTMLElement) {
      trigger?.setAttribute("aria-expanded", "false")
      trigger = source
      title.textContent = `${category.name} · 应用时长`
      dialog.setAttribute("aria-label", `罗盘 · ${category.name}应用时长`)
      dialog.style.setProperty("--category-color", /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(category.color) ? category.color : "var(--secondary)")
      const apps = (category.apps ?? []).filter(app => Number.isFinite(app.seconds) && app.seconds > 0)
        .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name))
      const summary = node("div", "", "activity-category-summary")
      summary.append(node("span", `${period.startDate} — ${period.endDate}`, "activity-category-period"), node("strong", duration(category.seconds)), node("span", `${apps.length} 个应用`))
      const list = node("ol", "", "activity-category-apps")
      const maximum = Math.max(1, ...apps.map(app => app.seconds))
      apps.forEach((app, index) => {
        const row = node("li")
        const name = node("strong", app.name)
        name.title = app.name
        const track = node("span", "", "activity-category-app-track")
        const fill = node("span")
        fill.style.width = `${app.seconds / maximum * 100}%`
        track.append(fill)
        row.append(node("span", String(index + 1), "activity-category-rank"), name, node("span", duration(app.seconds), "activity-category-app-time"), track)
        list.append(row)
      })
      body.replaceChildren(summary, apps.length ? list : node("p", category.apps ? "暂无应用记录" : "应用明细正在同步，请稍后刷新", "activity-category-empty"))
      body.scrollTop = 0
      if (!dialog.open) showSiteDialog(dialog)
      source.setAttribute("aria-expanded", "true")
    },
  }
}
