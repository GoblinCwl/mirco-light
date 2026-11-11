import {readContentCatalog} from "./contentCatalog"
import { setupDomainDetails } from "./domainDetails"
import { setupVisitorSky } from "./visitors"
import { setActivityCategoryColors } from "./activityColors"
import { setupAttendanceCalendar } from "./attendance"
import { createActivityDetails, type ActivityDetails } from "./activityDetails"
import { setupQQContact } from "./qqContact"
import { createActivityCategoryDetails, type ActivityCategory } from "./activityCategoryDetails"
import { setupHomeSkeletonLayout } from "./homeSkeletonLayout"

type ActivitySummary = {
  startDate: string
  endDate: string
  updatedAt: string
  lastActivity: string | null
  totalSeconds: number
  stale: boolean
  categories: ActivityCategory[]
}

const activityDuration = (seconds: number) => {
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`
}

const updateActivityCards = () => {
  document.querySelectorAll<HTMLElement>("[data-home-activity]").forEach((card) => {
    const categoryDetails = createActivityCategoryDetails()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 35000)
    window.addCleanup(() => { controller.abort(); clearTimeout(timeout) })
    const status = card.querySelector<HTMLElement>("[data-activity-status]")
    const endpoint = new URL(card.dataset.activityApi ?? "/api/activitywatch", location.origin)
    if (endpoint.origin !== location.origin) return
    card.setAttribute("aria-busy", "true")
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Activity unavailable")
        const result: ActivitySummary = await response.json()
        if (!Array.isArray(result.categories) || !Number.isFinite(result.totalSeconds)) throw new Error("Invalid statistics")
        if (!card.isConnected) return
        setActivityCategoryColors(result.categories)
        const total = card.querySelector<HTMLElement>("[data-activity-total]")
        const range = card.querySelector<HTMLElement>("[data-activity-range]")
        const bar = card.querySelector<HTMLElement>("[data-activity-bar]")
        const list = card.querySelector<HTMLElement>("[data-activity-categories]")
        if (total) total.textContent = activityDuration(result.totalSeconds)
        if (range) range.textContent = `${result.startDate.slice(5).replace("-", ".")} — ${result.endDate.slice(5).replace("-", ".")} 总计`
        bar?.replaceChildren()
        list?.replaceChildren()
        const categoryItems: { row: HTMLElement; segment: HTMLElement }[] = []
        const highlightCategory = (active?: HTMLElement) => {
          categoryItems.forEach(({ row, segment }) => {
            const selected = row === active
            row.classList.toggle("is-highlighted", selected)
            row.classList.toggle("is-muted", !!active && !selected)
            segment.classList.toggle("is-muted", !!active && !selected)
            segment.classList.toggle("is-highlighted", selected)
          })
        }
        const leadingCategory = result.categories.reduce<typeof result.categories[number] | undefined>((best, category) =>
          Number.isFinite(category.seconds) && Number.isFinite(category.percent) && Math.round(category.seconds / 60) >= 1 && (!best || category.seconds > best.seconds) ? category : best, undefined)
        result.categories.forEach((category) => {
          if (!Number.isFinite(category.seconds) || !Number.isFinite(category.percent) || Math.round(category.seconds / 60) < 1) return
          const color = /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(category.color) ? category.color : "#64748b"
          const segment = document.createElement("span")
          if (category === leadingCategory) {
            segment.classList.add("is-leading")
            const shimmer = document.createElement("span")
            shimmer.className = "activity-leading-shimmer"
            shimmer.setAttribute("aria-hidden", "true")
            segment.append(shimmer)
          }
          segment.style.setProperty("--spectrum-color", color)
          segment.style.setProperty("--spectrum-star-size", `${Math.max(3.5, Math.min(9, 3.5 + Math.sqrt(category.percent) * 0.7))}px`)
          segment.style.flexGrow = String(category.seconds)
          segment.title = `${category.name} · ${activityDuration(category.seconds)} · ${category.percent.toFixed(1)}%`
          bar?.append(segment)
          const row = document.createElement("div")
          row.className = "home-activity-category"
          row.tabIndex = 0
          row.title = segment.title
          categoryItems.push({ row, segment })
          for (const target of [row, segment]) {
            const openDetails = () => {
              highlightCategory()
              categoryDetails.open(category, result, target)
            }
            target.tabIndex = 0
            target.setAttribute("role", "button")
            target.setAttribute("aria-label", segment.title)
            target.setAttribute("aria-haspopup", "dialog")
            target.setAttribute("aria-expanded", "false")
            target.addEventListener("pointerenter", (event) => {
              if (event.pointerType === "mouse") highlightCategory(row)
            })
            target.addEventListener("pointerleave", (event) => {
              if (event.pointerType === "mouse") highlightCategory()
            })
            target.addEventListener("click", openDetails)
            target.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetails() }
              if (event.key === "Escape") highlightCategory()
            })
            target.addEventListener("focus", () => {
              if (target.matches(":focus-visible")) highlightCategory(row)
            })
            target.addEventListener("blur", () => highlightCategory())
          }
          const dot = document.createElement("i")
          dot.style.backgroundColor = color
          dot.setAttribute("aria-hidden", "true")
          const name = document.createElement("span")
          name.textContent = category.name
          const duration = document.createElement("span")
          duration.textContent = activityDuration(category.seconds)
          const percent = document.createElement("span")
          percent.textContent = `${category.percent.toFixed(1)}%`
          row.append(dot, name, duration, percent)
          list?.append(row)
        })
        const formatTime = (date: string) => new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(new Date(date))
        if (status) {
          status.textContent = result.stale ? `暂未同步 · 保留 ${formatTime(result.updatedAt)} 的统计`
            : result.totalSeconds === 0 ? "近 7 日暂无活动记录" : ""
          status.hidden = !status.textContent
        }
        card.dataset.loaded = "true"
      })
      .catch(() => {
        if (card.isConnected && status) {
          status.textContent = "活动统计暂不可用，稍后再来看看"
          status.hidden = false
        }
      })
      .finally(() => { clearTimeout(timeout); card.setAttribute("aria-busy", "false"); delete card.dataset.homePending })
  })
}

const updateQQStatus = () => {
  const badge = document.querySelector<HTMLElement>("[data-home-qq-status]")
  if (!badge) return
  const controller = new AbortController()
  const update = async () => {
    if (document.hidden) return
    try {
      const response = await fetch("/api/qq-status", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      if (!response.ok) throw new Error("QQ status unavailable")
      const result: { state: string; label: string } = await response.json()
      if (!badge.isConnected || controller.signal.aborted) return
      badge.dataset.state = ["online", "offline", "away", "busy"].includes(result.state) ? result.state : "unknown"
      badge.setAttribute("aria-label", result.label)
      badge.title = `${result.label} · 2395025802`
    } catch {
      if (!controller.signal.aborted) {
        badge.dataset.state = "unknown"
        badge.setAttribute("aria-label", "QQ 状态未知")
        badge.title = "QQ 状态未知 · 2395025802"
      }
    }
  }
  void update()
  const timer = setInterval(update, 60000)
  document.addEventListener("visibilitychange", update)
  window.addCleanup(() => {
    controller.abort()
    clearInterval(timer)
    document.removeEventListener("visibilitychange", update)
  })
}

const updateActivityStatus = () => {
  const dot = document.querySelector<HTMLElement>("[data-home-activity-status]")
  if (!dot) return
  const button = dot.closest<HTMLElement>(".home-activity-monitor")
  if (!button) return
  const details = createActivityDetails(button)
  const controller = new AbortController()
  const currentStatus = document.querySelector<HTMLElement>("[data-activity-current-status]")
  const show = (state: string, label: string, scene?: string | null) => {
    dot.dataset.state = state
    dot.setAttribute("aria-label", label)
    const tooltip = scene ? `${label} · ${scene}` : label
    if (dot.parentElement) dot.parentElement.title = tooltip
    if (currentStatus) {
      const text = state === "active" ? `活跃：${scene || "未命名场景"}` : state === "unknown" ? "—" : label
      currentStatus.textContent = text
    }
  }
  show("unknown", "状态未知")
  let loading = false
  let queued = false
  const update = async () => {
    if (document.hidden || loading) return
    loading = true
    try {
      const wantDetails = details.isOpen
      const response = await fetch(wantDetails ? "/api/activity-status/details" : "/api/activity-status", {
        cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      })
      if (!response.ok) throw new Error("Activity status unavailable")
      const result: Partial<ActivityDetails> & { state: string } = await response.json()
      if (!dot.isConnected || controller.signal.aborted) return
      if (result.state === "active") show("active", "活跃", typeof result.scene === "string" ? result.scene : null)
      else if (result.state === "afk") show("afk", "暂离")
      else if (result.state === "offline") show("offline", "离线")
      else show("unknown", "状态未知")
      if (wantDetails && result.health && Array.isArray(result.recentActivities)) details.render(result as ActivityDetails)
      else if (details.isOpen) queued = true
    } catch {
      if (!controller.signal.aborted) {
        show("unknown", "状态未知")
        details.error()
      }
    } finally {
      loading = false
      if (queued && !controller.signal.aborted) { queued = false; void update() }
    }
  }
  void update()
  const openDetails = () => {
    details.open()
    if (loading) queued = true
    else void update()
  }
  button.addEventListener("click", openDetails)
  const timer = setInterval(update, 30000)
  document.addEventListener("visibilitychange", update)
  window.addCleanup(() => {
    controller.abort()
    clearInterval(timer)
    document.removeEventListener("visibilitychange", update)
    button.removeEventListener("click", openDetails)
    details.destroy()
  })
}

const setupDomainStars = () => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)")
  document.querySelectorAll<HTMLElement>(".home-explore-item, .home-domain-details-open").forEach((link, index) => {
    const svg = link.querySelector<SVGSVGElement>(".home-directory-stars, .home-title-constellation")
    const dust=svg?.querySelector<SVGGElement>(".home-domain-drift")
    if (!dust) return
    const constellation=svg?.querySelector<SVGGElement>(".home-domain-constellation")
    const spin=constellation?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 60000 + index * 4000, iterations: Infinity, easing: "linear" })
    const rotation = dust.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 30000 + index * 3000, iterations: Infinity, easing: "linear" })
    let frame: number | undefined
    let hovered = false, focused = false
    const setSpeed = () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      if (media.matches) { rotation.pause(); spin?.pause(); return }
      rotation.play(); spin?.play()
      const from = rotation.playbackRate, target = hovered || focused ? 1.6 : 1, start = performance.now()
      const ramp = (now: number) => {
        const t = Math.min(1, (now - start) / 300)
        rotation.updatePlaybackRate(from + (target - from) * (t * (2 - t)))
        spin?.updatePlaybackRate(rotation.playbackRate)
        frame = t < 1 ? requestAnimationFrame(ramp) : undefined
      }
      frame = requestAnimationFrame(ramp)
    }
    const enter = () => { hovered = true; setSpeed() }
    const leave = () => { hovered = false; setSpeed() }
    const focus = () => { focused = true; setSpeed() }
    const blur = () => { focused = false; setSpeed() }
    link.addEventListener("mouseenter", enter)
    link.addEventListener("mouseleave", leave)
    link.addEventListener("focus", focus)
    link.addEventListener("blur", blur)
    media.addEventListener("change", setSpeed)
    setSpeed()
    window.addCleanup(() => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      rotation.cancel(); spin?.cancel()
      link.removeEventListener("mouseenter", enter)
      link.removeEventListener("mouseleave", leave)
      link.removeEventListener("focus", focus)
      link.removeEventListener("blur", blur)
      media.removeEventListener("change", setSpeed)
    })
  })
}

const updateHomeDashboard = () => {
  if (document.body.dataset.slug !== "index") return
  const article = document.querySelector<HTMLElement>('.center > article')
  if (article) setupHomeSkeletonLayout(article)

  document.querySelectorAll<HTMLImageElement>("article img").forEach((image) => {
    image.draggable = false
  })

  const avatar = document.querySelector<HTMLImageElement>(".home-profile-avatar")
  const profile = document.querySelector<HTMLElement>(".home-profile-card")
  const finishProfile = () => { if (profile) { delete profile.dataset.homePending; profile.setAttribute("aria-busy", "false") } }
  if (avatar) {
    let disposed = false
    const reveal = async () => {
      if (!avatar.naturalWidth) { finishProfile(); return }
      try { await avatar.decode() } catch { /* A fully loaded image can still be displayed. */ }
      if (!disposed && avatar.isConnected) { avatar.classList.add("is-avatar-ready"); finishProfile() }
    }
    avatar.addEventListener("load", reveal)
    avatar.addEventListener("error", finishProfile)
    if (avatar.complete) void reveal()
    window.addCleanup(() => { disposed = true; avatar.removeEventListener("load", reveal); avatar.removeEventListener("error", finishProfile) })
  } else finishProfile()

  const domains = document.querySelector<HTMLElement>(".home-star-domains")
  requestAnimationFrame(() => { if (domains?.isConnected) { delete domains.dataset.homePending; domains.setAttribute("aria-busy", "false") } })

  updateActivityCards()
  updateQQStatus()
  setupQQContact()
  updateActivityStatus()
  setupAttendanceCalendar()
  setupVisitorSky()
  setupDomainDetails()
  setupDomainStars()

  const data = document.querySelector<HTMLElement>(".home-dashboard-data")
  if (!data) return

  const articleCount = document.querySelector<HTMLElement>("[data-home-article-count]")
  if (articleCount) { articleCount.textContent = data.dataset.articleCount ?? "0"; delete articleCount.dataset.homeStatPending }
  const counters=[['[data-home-repo-count]','repo'],['[data-home-video-count]','video']] as const
  if(counters.some(([selector])=>document.querySelector(selector)))void readContentCatalog().then(catalog=>{
    for(const [selector,kind]of counters){const target=document.querySelector<HTMLElement>(selector);if(target)target.textContent=String(Object.values(catalog.pages).filter(page=>page.type===kind).length)}
  }).catch(()=>{for(const [selector]of counters){const target=document.querySelector<HTMLElement>(selector);if(target)target.textContent='—'}}).finally(()=>{for(const [selector]of counters){const target=document.querySelector<HTMLElement>(selector);if(target)delete target.dataset.homeStatPending}})


  const quoteText = document.querySelector<HTMLElement>("[data-home-hitokoto]")
  const quoteFrom = document.querySelector<HTMLElement>("[data-home-hitokoto-from]")
  if (!quoteText) return

  quoteText.textContent = ""
  if (quoteFrom) {
    quoteFrom.textContent = ""
    quoteFrom.style.opacity = "0"
  }
  const quoteRequest = new AbortController()
  let typingTimer: ReturnType<typeof setTimeout> | undefined
  const requestTimeout = setTimeout(() => quoteRequest.abort(), 15000)
  window.addCleanup(() => {
    quoteRequest.abort()
    clearTimeout(requestTimeout)
    clearTimeout(typingTimer)
  })

  fetch(quoteText.dataset.homeHitokotoApi ?? "/api/hitokoto", { signal: quoteRequest.signal })
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then((result: { hitokoto?: string; from?: string; from_who?: string }) => {
      clearTimeout(requestTimeout)
      if (!result.hitokoto || quoteRequest.signal.aborted || !quoteText.isConnected) return
      const fullText = `「${result.hitokoto}」`
      const showSource = () => {
        if (quoteFrom) {
          quoteFrom.textContent = [result.from_who, result.from].filter(Boolean).join(" · ")
          quoteFrom.style.opacity = "1"
        }
      }
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        quoteText.textContent = fullText
        showSource()
        return
      }

      // Measure the complete quote first so wrapping never moves content while typing.
      quoteText.textContent = fullText
      quoteText.style.minHeight = `${quoteText.getBoundingClientRect().height}px`
      quoteText.textContent = ""
      const characters = Array.from(fullText)
      const typed = document.createTextNode("")
      quoteText.append(typed)
      let index = 0
      const typeNext = () => {
        if (quoteRequest.signal.aborted || !quoteText.isConnected) return
        const character = characters[index++]
        typed.appendData(character)
        if (index === characters.length) {
          showSource()
          return
        }
        const pause = /[，。！？；、,.!?;：:]/u.test(character) ? 140 + Math.random() * 180 : 0
        typingTimer = setTimeout(typeNext, 35 + Math.random() * 75 + pause)
      }
      typingTimer = setTimeout(typeNext, 100 + Math.random() * 150)
    })
    .catch(() => undefined)
    .finally(() => clearTimeout(requestTimeout))
}

document.addEventListener("nav", updateHomeDashboard)
