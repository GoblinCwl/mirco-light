import { showSiteDialog } from "./siteDialog"
import { activityCategoryColor } from "./activityColors"

export type ActivityDetails = {
  state: string; label: string; scene: string | null; updatedAt: string
  focus: { app: string | null; title: string | null; category: string | null; durationSeconds: number | null; timestamp: string | null } | null
  threads: { name: string | null; role: string | null; confidence: number | null; startedAt: string | null; lastActiveAt: string | null }[]
  categoryProfile: { name: string; share: number }[]
  profileWindowSeconds: number | null; sceneUpdatedAt: string | null
  communication: { active: boolean; seconds: number | null; apps: string[] }
  previousScene: { name: string | null; endedAt: string | null } | null
  recentActivities: { app: string | null; title: string | null; category: string | null; timestamp: string | null; durationSeconds: number | null; eventCount: number | null }[]
  health: { running: boolean; connected: boolean; lastScanAt: string | null; scanIntervalSeconds: number | null; uptimeSeconds: number | null }
}

const element = (tag: string, text?: string, className?: string) => {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  return node
}
const duration = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "—"
  const total = Math.round(seconds)
  if (total < 60) return `${total} 秒`
  if (total < 3600) return `${Math.floor(total / 60)} 分 ${total % 60} 秒`
  return `${Math.floor(total / 3600)} 小时 ${Math.floor(total % 3600 / 60)} 分`
}
const time = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—"

export function activitySceneLabel(data: Pick<ActivityDetails, "state" | "scene" | "label">) {
  const state = data.state.toLowerCase()
  if (state === "active") {
    const scene = data.scene?.trim()
    return scene && scene !== "未命名场景" ? `熱中 · ${scene}` : "🌠再臨"
  }
  if (state === "afk") return "🍃神隠し"
  if (state === "offline") return "💤圏外"
  return data.label || "🫧不可視"
}

export function createActivityDetails(button: HTMLElement) {
  const dialog = document.createElement("dialog")
  dialog.className = "activity-details activity-voyage"
  dialog.setAttribute("aria-label", "罗盘 · 活动详情")
  const header = element("div", undefined, "activity-details-header")
  header.append(element("strong", "罗盘 · 活动详情"))
  const close = document.createElement("button")
  close.type = "button"
  close.setAttribute("aria-label", "关闭活动详情")
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
  header.append(close)
  const body = element("div", undefined, "activity-details-body")
  let loadingStartedAt = 0
  let renderTimer: ReturnType<typeof setTimeout> | undefined
  body.setAttribute("aria-busy", "true")
  dialog.append(header, body)
  document.body.append(dialog)
  close.addEventListener("click", () => dialog.close())
  dialog.addEventListener("close", () => {
    clearTimeout(renderTimer)
    button.setAttribute("aria-expanded", "false")
  })
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
  })
  const section = (name: string) => {
    const node = element("section", undefined, "activity-details-section")
    node.append(element("strong", name, "activity-details-section-title"))
    body.append(node)
    return node
  }
  return {
    get isOpen() { return dialog.open },
    open() {
      if (!dialog.open) {
        clearTimeout(renderTimer)
        loadingStartedAt = performance.now()
        const loader = element("div", undefined, "activity-details-loading")
        loader.setAttribute("role", "status")
        loader.setAttribute("aria-label", "正在加载活动详情")
        const spinner = element("span", undefined, "activity-details-spinner")
        spinner.setAttribute("aria-hidden", "true")
        loader.append(spinner)
        body.replaceChildren(loader)
        body.classList.remove("is-ready")
        body.setAttribute("aria-busy", "true")
        showSiteDialog(dialog)
        button.setAttribute("aria-expanded", "true")
      }
    },
    render(data: ActivityDetails) {
      if (!dialog.open) return
      const wait = 300 - (performance.now() - loadingStartedAt)
      if (wait > 0) {
        clearTimeout(renderTimer)
        renderTimer = setTimeout(() => this.render(data), wait)
        return
      }
      const scrollTop = body.scrollTop
      const expanded = new Set([...body.querySelectorAll<HTMLDetailsElement>("details[open][data-entry-key]")].map(node => node.dataset.entryKey))
      body.replaceChildren()
      body.setAttribute("aria-busy", "false")
      body.classList.add("is-ready")
      const hero = element("div", undefined, "voyage-now")
      hero.dataset.state = data.state.toLowerCase()
      const star = element("span", undefined, "voyage-beacon")
      star.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><g class="voyage-supernova-rays" fill="currentColor"><path d="m32 3 5 24 24 5-24 5-5 24-5-24-24-5 24-5Z"/><path opacity=".4" d="m12 12 20 13 20-13-13 20 13 20-20-13-20 13 13-20Z"/></g><circle cx="32" cy="32" r="7" fill="currentColor"/><circle cx="32" cy="32" r="3.5" fill="#fff9e9"/></svg>'
      star.setAttribute("aria-hidden", "true")
      const heading = element("div")
      const currentScene = activitySceneLabel(data)
      heading.append(element("small", "此刻的航向"), element("strong", currentScene))
      hero.append(star, heading)
      body.append(hero)
      if (data.focus) {
        const focus = element("div", undefined, "voyage-focus")
        focus.append(element("strong", data.focus.app || "当前活动"))
        if (data.focus.title) focus.append(element("p", data.focus.title, "voyage-window"))
        const meta = [data.focus.category, data.focus.durationSeconds !== null ? `持续 ${duration(data.focus.durationSeconds)}` : null,
          data.focus.timestamp ? time(data.focus.timestamp) : null].filter(Boolean)
        focus.append(element("div", meta.join(" · "), "voyage-meta"))
        body.append(focus)
      }
      if (data.previousScene?.name) {
        body.append(element("p", `上一站 · ${data.previousScene.name}${data.previousScene.endedAt ? ` · ${time(data.previousScene.endedAt)}` : ""}`, "voyage-meta"))
      }
      if (data.threads?.length) {
        const threads = section("并行星轨")
        const roles: Record<string, string> = { primary: "主线", secondary: "支线", background: "后台" }
        for (const thread of data.threads) {
          const row = element("details", undefined, "voyage-thread") as HTMLDetailsElement
          row.dataset.entryKey = `thread:${thread.name}:${thread.startedAt}`
          row.open = expanded.has(row.dataset.entryKey)
          row.append(element("summary", `${thread.name || "未命名活动"} · ${roles[thread.role ?? ""] ?? thread.role ?? ""}`))
          row.append(element("p", [thread.startedAt ? `开始 ${time(thread.startedAt)}` : null,
            thread.lastActiveAt ? `最近活跃 ${time(thread.lastActiveAt)}` : null,
            thread.confidence !== null ? `置信度 ${Math.round(Math.min(1, thread.confidence) * 100)}%` : null].filter(Boolean).join(" · "), "voyage-meta"))
          threads.append(row)
        }
      }
      if (data.categoryProfile?.length) {
        const profile = section("近期光谱")
        if (data.profileWindowSeconds !== null) profile.append(element("small", `最近 ${duration(data.profileWindowSeconds)}`, "voyage-meta"))
        for (const category of data.categoryProfile) {
          const row = element("div", undefined, "activity-details-profile")
          const track = element("span", undefined, "activity-details-track")
          const fill = element("span")
          fill.style.width = `${Math.max(0, Math.min(100, category.share * 100))}%`
          fill.style.backgroundColor = activityCategoryColor(category.name)
          fill.style.boxShadow = `0 0 5px color-mix(in srgb, ${activityCategoryColor(category.name)} 30%, transparent)`
          track.append(fill)
          row.append(element("span", category.name), track, element("span", `${(category.share * 100).toFixed(1)}%`))
          profile.append(row)
        }
      }
      if (data.communication?.apps?.length) {
        const context = section("通讯信号")
        if (data.communication?.apps?.length) {
          context.append(element("p", [data.communication.active ? "通讯中" : "近期通讯", data.communication.apps.join("、"),
            data.communication.seconds !== null ? duration(data.communication.seconds) : null].filter(Boolean).join(" · ")))
        }

      }
      if (data.recentActivities?.length) {
        const recent = section("活动航迹")
        const timeline = element("div", undefined, "voyage-timeline")
        for (const activity of data.recentActivities) {
          const row = element("details", undefined, "voyage-stop") as HTMLDetailsElement
          row.dataset.entryKey = `activity:${activity.app}:${activity.timestamp}`
          row.open = expanded.has(row.dataset.entryKey)
          const summary = element("summary")
          summary.append(element("span", time(activity.timestamp), "voyage-meta"),
            element("strong", activity.app || activity.category || "未命名活动"),
            element("span", [activity.category, activity.durationSeconds !== null ? duration(activity.durationSeconds) : null].filter(Boolean).join(" · "), "voyage-meta"))
          row.append(summary)
          if (activity.title) row.append(element("p", activity.title, "voyage-window"))
          if (activity.eventCount) row.append(element("small", `${activity.eventCount} 条记录`, "voyage-meta"))
          timeline.append(row)
        }
        recent.append(timeline)
      }
      body.scrollTop = scrollTop
    },
    error() {
      clearTimeout(renderTimer)
      if (dialog.open) {
        body.setAttribute("aria-busy", "false")
        body.replaceChildren(element("p", "活动详情暂不可用，稍后会自动重试。"))
      }
    },
    destroy() { clearTimeout(renderTimer); dialog.close(); dialog.remove() },
  }
}
