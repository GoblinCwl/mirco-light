import { driveActionDialog } from "./driveActionDialog"
import { artalkIdentityChange, artalkUserStorageKey, readCachedArtalkIdentity } from "./artalkIdentity"
import { identicon, resolveCommentAvatar } from "./identicon"
import { preloadStarbudMarkdown, renderStarbudMarkdown, starbudMarkdownReady } from "./starbudMarkdown"
import { sharedState } from "./sharedRequest"
import { currentStarbudUnlock, type StarbudReadRequest } from "./starbudUnlocked"
import { browserId } from "./visitorRecording"
import { articleLinkRoutes, linkIconSVG } from "../../util/linkIcons"

type Turn = { id: string; question: string; sentAt?: number; answer?: string; partial?: string }
type HistoryKind = "turns" | "privateTurns"
const changeEvent = "starbud-conversation"
const streamEvent = "starbud-stream"
const unavailable = "星芽暂时无法回复，请稍后再试"
const exhaustedPlaceholder = "今日次数已用完，零点恢复"
const draftInterval = 64
const draftBufferDelay = 140
const draftDrainTime = 550

async function readReply(response: Response, update: (text: string) => void, readContext: (event: StarbudReadRequest) => Promise<void>) {
  if (!response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
    const data = await response.json()
    if (response.ok && typeof data.reply === "string") return data.reply
    throw new Error(typeof data.error === "string" ? data.error : unavailable)
  }
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader()
  if (!response.ok || !reader) throw new Error(unavailable)
  let buffer = ""
  let text = ""
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) throw new Error(unavailable)
      buffer += value
      let newline: number
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line.startsWith("data: ")) continue
        const event = JSON.parse(line.slice(6))
        if (event.type === "read_request") void readContext(event).catch(() => {})
        if (event.type === "error") throw new Error(unavailable)
        if (event.type === "done" && typeof event.text === "string" && event.text.trim()) return event.text
        if (event.type === "delta" && typeof event.text === "string") {
          text += event.text
          update(text.trimStart())
        } else if (event.type === "reset") {
          text = ""
          update(text)
        }
      }
    }
  } finally {
    void reader.cancel().catch(() => {})
  }
}

export function setupStarbudConversation(dialog: HTMLDialogElement, signal: AbortSignal) {
  const user = browserId()
  const storage = `starbud-chat:v1:${user}`
  const historyKeys = { turns: storage, privateTurns: `starbud-chat-private:v1:${user}` }
  const state = sharedState(storage, () => ({ pending: "", draft: "", error: "", turns: [] as Turn[], privateTurns: [] as Turn[] }))
  const clear = dialog.querySelector<HTMLButtonElement>("[data-agent-chat-clear]")
  const thread = dialog.querySelector<HTMLElement>(".agent-chat-thread")!
  const history = dialog.querySelector<HTMLElement>(".agent-chat-history")!
  const form = dialog.querySelector<HTMLFormElement>(".agent-chat-composer")!
  const pageContext = form.querySelector<HTMLElement>(".agent-chat-page-context")!
  const pageIcon = pageContext.querySelector<HTMLElement>(".agent-chat-page-icon")!
  const pageName = pageContext.querySelector<HTMLElement>(".agent-chat-page-name")!
  const input = form.querySelector("textarea")!
  const entry = form.querySelector(".agent-chat-entry")!
  const placeholder = entry.querySelector<HTMLElement>(".agent-chat-placeholder")!
  const defaultPlaceholder = placeholder.textContent ?? ""
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
  const avatar = dialog.querySelector<HTMLImageElement>(".agent-chat-avatar")!
  const quota = form.querySelector<HTMLElement>(".agent-chat-quota")!
  const quotaFill = quota.querySelector(".agent-chat-quota-fill")!
  const quotaTooltip = form.querySelector<HTMLElement>(".agent-chat-quota-tooltip")!
  let remaining: number | undefined
  let limit = 10
  let quotaCheck = 0
  let quotaTimer: number | undefined
  let avatarCheck = 0
  let visitorAvatar: { source: string; seed: string } | undefined
  let liveRow: HTMLElement | undefined
  let liveFrame = 0
  let lastDraftFrame = 0
  let shownDraft = ""
  let draftResumeAt = 0
  let draftDrainUntil = 0
  let resolveDraftDrain: (() => void) | undefined
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
  let opening = 0

  const refreshPageContext = () => {
    const page = new URL(location.href)
    const tag = /^\/tags\/?$/.test(page.pathname) ? page.searchParams.get("tag")?.trim() : ""
    const selectedTag = tag && new TextEncoder().encode(tag).length <= 600 ? tag : ""
    const path = page.pathname + (selectedTag ? `?${new URLSearchParams({ tag: selectedTag })}` : "")
    const suffix = pageContext.dataset.titleSuffix || ""
    const title = suffix && document.title.endsWith(suffix) ? document.title.slice(0, -suffix.length) : document.title
    const label = (page.pathname === "/" ? "首页" : title.trim() || page.pathname) + (selectedTag ? ` · #${selectedTag}` : "")
    const articles = pageContext.hasAttribute("data-article") ? articleLinkRoutes([page.pathname]) : undefined
    pageIcon.innerHTML = linkIconSVG(page.href, page.origin, articles) ?? ""
    pageName.textContent = label
    pageContext.title = `${label}\n${path}`
    return path
  }

  const updatePageContextIfOpen = () => { if (dialog.open) refreshPageContext() }
  const titleObserver = new MutationObserver(updatePageContextIfOpen)
  const titleElement = document.head.querySelector("title")
  if (titleElement) {
    titleObserver.observe(titleElement, { childList: true, characterData: true, subtree: true })
  }
  window.addEventListener("popstate", updatePageContextIfOpen, { signal })

  const fillVisitorAvatar = (slot: HTMLElement) => {
    if (!visitorAvatar) {
      slot.replaceChildren()
      return
    }
    const { source, seed } = visitorAvatar
    if (slot.querySelector("img")?.getAttribute("src") === source) return
    const image = new Image()
    image.alt = ""
    image.decoding = "async"
    image.referrerPolicy = "no-referrer"
    image.setAttribute("no-view", "")
    image.addEventListener("error", () => { image.src = identicon(seed) }, { once: true })
    image.src = source
    slot.replaceChildren(image)
  }
  const refreshVisitorAvatar = async () => {
    const ticket = ++avatarCheck
    const identity = readCachedArtalkIdentity()
    const updateSlots = () => history.querySelectorAll<HTMLElement>(".agent-chat-visitor-avatar").forEach(fillVisitorAvatar)
    if (!identity) {
      visitorAvatar = { source: identicon(user), seed: user }
      updateSlots()
      return
    }
    let seed = identity.name || "visitor"
    let emailHashed = false
    if (identity.email && crypto.subtle) {
      try {
        // Artalk hashes lowercase email addresses with SHA-256.
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity.email))
        seed = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("")
        emailHashed = true
      } catch { /* Generate a local avatar if hashing is unavailable. */ }
    }
    if (ticket !== avatarCheck || signal.aborted) return
    if (visitorAvatar?.seed !== seed) {
      visitorAvatar = undefined
      updateSlots()
    }
    const source = emailHashed ? await resolveCommentAvatar(seed, identity.admin) : identicon(seed)
    if (ticket !== avatarCheck || signal.aborted) return
    visitorAvatar = { source, seed }
    updateSlots()
  }

  const read = (kind: HistoryKind = "turns") => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(historyKeys[kind]) || "null")
      if (Array.isArray(parsed)) {
        state[kind] = parsed.filter(turn => turn && typeof turn.id === "string" && typeof turn.question === "string" &&
          (turn.sentAt === undefined || Number.isFinite(turn.sentAt)) &&
          (turn.answer === undefined || typeof turn.answer === "string") &&
          (turn.partial === undefined || typeof turn.partial === "string"))
      }
    } catch { /* Keep the in-memory history when browser storage is unavailable. */ }
    return state[kind]
  }
  const mergeHistory = (unlockedTurns: Turn[]) => [...read(), ...unlockedTurns]
    .sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0))
  const displayedTurns = () => mergeHistory(read("privateTurns"))
  const hasMarkdown = () => !!state.draft || displayedTurns().some(turn => turn.answer || turn.partial)
  if (hasMarkdown()) void preloadStarbudMarkdown()
  const write = (kind: HistoryKind, turns: Turn[]) => {
    state[kind] = turns
    try { localStorage.setItem(historyKeys[kind], JSON.stringify(turns)) } catch { /* The current tab keeps its in-memory history. */ }
    document.dispatchEvent(new Event(changeEvent))
  }
  const addMessage = (text: string, kind: "reply" | "visitor" | "error" = "reply", interrupted = false) => {
    const row = document.createElement("div")
    row.className = `agent-chat-message is-${kind}`
    if (kind !== "visitor") row.append(avatar.cloneNode())
    const bubble = document.createElement(kind === "reply" ? "div" : "p")
    bubble.className = "agent-chat-bubble"
    row.append(bubble)
    if (kind === "reply" && text) paintReply(bubble, text, interrupted)
    else bubble.textContent = text
    if (kind === "visitor") {
      const slot = document.createElement("span")
      slot.className = "agent-chat-avatar agent-chat-visitor-avatar"
      fillVisitorAvatar(slot)
      row.append(slot)
    }
    history.append(row)
    return row
  }
  const nearBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 36
  const paintReply = (bubble: HTMLElement, text: string, interrupted = false) => {
    let content = bubble.querySelector<HTMLElement>(".starbud-markdown")
    if (!content) {
      content = document.createElement("div")
      bubble.replaceChildren(content)
      if (interrupted) {
        const status = document.createElement("small")
        status.className = "agent-chat-interrupted"
        status.textContent = "回复中断"
        bubble.append(status)
      }
    }
    renderStarbudMarkdown(content, text, () => {
      if (dialog.open && nearBottom()) thread.scrollTop = thread.scrollHeight
    })
  }
  const paintDraft = () => {
    if (!liveRow) return
    const follow = nearBottom()
    const bubble = liveRow.querySelector<HTMLElement>(".agent-chat-bubble")!
    if (shownDraft) {
      liveRow.classList.remove("is-pending")
      paintReply(bubble, shownDraft)
    } else if (!liveRow.classList.contains("is-pending")) {
      liveRow.classList.add("is-pending")
      bubble.textContent = "星芽正在回复"
      const dots = document.createElement("span")
      dots.className = "agent-chat-dots"
      dots.setAttribute("aria-hidden", "true")
      dots.append(...Array.from({ length: 3 }, () => document.createElement("i")))
      bubble.append(dots)
    }
    if (dialog.open && follow) thread.scrollTop = thread.scrollHeight
  }
  const stopDraftFrames = () => {
    cancelAnimationFrame(liveFrame)
    liveFrame = 0
    lastDraftFrame = 0
    draftResumeAt = 0
    draftDrainUntil = 0
    resolveDraftDrain?.()
    resolveDraftDrain = undefined
  }
  const scheduleDraft = () => {
    if (!dialog.open || document.hidden || !liveRow || liveFrame || shownDraft === state.draft) return
    if (!draftResumeAt && !draftDrainUntil && !reducedMotion.matches) {
      const now = performance.now()
      if (!lastDraftFrame || now - lastDraftFrame >= draftBufferDelay) draftResumeAt = now + draftBufferDelay
    }
    liveFrame = requestAnimationFrame(now => {
      liveFrame = 0
      if (!dialog.open || document.hidden || !liveRow) {
        stopDraftFrames()
        return
      }
      if (!reducedMotion.matches && (now < draftResumeAt || now - lastDraftFrame < draftInterval)) {
        scheduleDraft()
        return
      }
      lastDraftFrame = now
      const backlog = state.draft.length - shownDraft.length
      const target = draftDrainUntil ? Math.max(draftInterval, draftDrainUntil - now) : 700
      const batch = reducedMotion.matches ? backlog : Math.ceil(backlog * draftInterval / target)
      let end = Math.min(state.draft.length, shownDraft.length + batch)
      const next = state.draft.charCodeAt(end)
      if (next >= 0xdc00 && next <= 0xdfff) end++
      shownDraft = state.draft.slice(0, end)
      paintDraft()
      if (shownDraft === state.draft) {
        draftResumeAt = 0
        resolveDraftDrain?.()
        resolveDraftDrain = undefined
      } else scheduleDraft()
    })
  }
  const drainDraft = () => {
    if (signal.aborted || !dialog.open || document.hidden || !liveRow || shownDraft === state.draft) return
    draftDrainUntil = performance.now() + draftDrainTime
    return new Promise<void>(resolve => {
      resolveDraftDrain = resolve
      scheduleDraft()
    })
  }
  const refreshSend = () => {
    const exhausted = remaining === 0
    input.disabled = exhausted
    entry.toggleAttribute("data-empty", exhausted || input.value === "")
    placeholder.textContent = exhausted ? exhaustedPlaceholder : defaultPlaceholder
    input.setAttribute("aria-placeholder", placeholder.textContent)
    send.disabled = !!state.pending || exhausted || !input.value.trim()
    if (clear) clear.disabled = !!state.pending || !(state.turns.length || state.privateTurns.length)
  }
  const showQuota = () => {
    const percentage = remaining === undefined ? 0 : Math.max(0, Math.round((1 - remaining / limit) * 100))
    quotaFill.setAttribute("stroke-dashoffset", String(100 - percentage))
    quota.classList.toggle("has-usage", percentage > 0)
    if (remaining === undefined) quota.removeAttribute("aria-valuenow")
    else quota.setAttribute("aria-valuenow", String(percentage))
    const label = remaining === undefined ? "剩余对话次数暂不可用" : `今日剩余 ${remaining} / ${limit} 次对话`
    quotaTooltip.textContent = label
    quota.setAttribute("aria-valuetext", label)
    refreshSend()
  }
  const refreshQuota = async () => {
    const ticket = ++quotaCheck
    try {
      const response = await fetch("/api/starbud/quota", {
        headers: { "X-Visitor-ID": user },
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      })
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (!Number.isInteger(data.remaining) || data.remaining < 0) throw new Error()
      if (signal.aborted || ticket !== quotaCheck) return
      if (Number.isInteger(data.limit) && data.limit > 0) limit = data.limit
      remaining = data.remaining
      clearTimeout(quotaTimer)
      const delay = Date.parse(data.resets_at) - Date.now()
      if (delay > 0) quotaTimer = window.setTimeout(() => {
        if (dialog.open) void refreshQuota()
      }, delay + 500)
    } catch {
      if (signal.aborted || ticket !== quotaCheck) return
      if (remaining === 0) {
        clearTimeout(quotaTimer)
        quotaTimer = window.setTimeout(() => {
          if (dialog.open) void refreshQuota()
        }, 30000)
      } else remaining = undefined
    }
    showQuota()
  }
  const render = (forceScroll = false) => {
    if (thread.hasAttribute("aria-busy")) return
    const previousScroll = thread.scrollTop
    const follow = forceScroll || nearBottom()
    liveRow = undefined
    history.replaceChildren()
    for (const turn of displayedTurns()) {
      addMessage(turn.question, "visitor")
      if (turn.answer) addMessage(turn.answer)
      else if (turn.id === state.pending) {
        liveRow = addMessage("")
        liveRow.setAttribute("aria-live", "off")
        paintDraft()
      } else if (turn.partial) addMessage(turn.partial, "reply", true)
    }
    if (!state.pending && state.error) addMessage(state.error, "error")
    refreshSend()
    if (dialog.open) thread.scrollTop = follow ? thread.scrollHeight : previousScroll
    scheduleDraft()
  }

  clear?.addEventListener("click", () => {
    const confirmation = driveActionDialog("清空历史", signal)
    confirmation.note("清空当前浏览器中的星芽对话记录？")
    confirmation.submit.textContent = "清空"
    confirmation.submit.classList.add("is-danger")
    confirmation.run(async () => {
      for (const kind of ["turns", "privateTurns"] as const) {
        try { localStorage.removeItem(historyKeys[kind]) } catch { /* Storage may be unavailable. */ }
        state[kind] = []
      }
      state.error = ""
      document.dispatchEvent(new Event(changeEvent))
    })
  }, { signal })

  form.addEventListener("submit", async event => {
    event.preventDefault()
    const question = input.value.trim()
    if (!question || state.pending || remaining === 0) return
    const turn: Turn = { question, id: crypto.randomUUID(), sentAt: Date.now() }
    state.pending = turn.id
    shownDraft = ""
    state.draft = ""
    state.error = ""
    refreshSend()
    let answer: string | undefined
    let recordedKind: HistoryKind | undefined
    let unlock: Awaited<ReturnType<typeof currentStarbudUnlock>>
    const pageURL = refreshPageContext()
    try {
      unlock = await currentStarbudUnlock(signal)
      signal.throwIfAborted()
      if (pageURL !== refreshPageContext()) throw Error("页面已切换，请重新发送")
      const privateTurns = read("privateTurns")
      const privateIds = new Set(privateTurns.map(item => item.id))
      const previousTurns = mergeHistory(privateTurns)
      let privateHistory = false
      const context: { role: string; text: string }[] = []
      let bytes = 0
      const encoder = new TextEncoder()
      for (const turn of [...previousTurns].reverse()) {
        if (!turn.answer) continue
        bytes += encoder.encode(turn.question).length + encoder.encode(turn.answer).length
        if (bytes > 36000 || context.length >= 12) break
        privateHistory ||= privateIds.has(turn.id)
        context.unshift({ role: "user", text: turn.question }, { role: "assistant", text: turn.answer })
      }
      input.value = ""
      recordedKind = unlock || privateHistory ? "privateTurns" : "turns"
      write(recordedKind, [...read(recordedKind), turn])
      thread.scrollTop = thread.scrollHeight
      const timeout = AbortSignal.timeout(110000)
      const chatSignal = unlock ? AbortSignal.any([signal, timeout]) : timeout
      const response = await fetch("/api/starbud/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream", "X-Visitor-ID": user },
        body: JSON.stringify({ message: question, page_url: pageURL, sender_name: readCachedArtalkIdentity()?.name, history: context, private_history: privateHistory || undefined, unlocked_context: unlock?.descriptor }),
        signal: chatSignal,
      })
      if (response.status === 429) {
        ++quotaCheck
        remaining = 0
        showQuota()
      } else if (response.ok && dialog.open && !signal.aborted) {
        void refreshQuota()
      }
      answer = await readReply(response, text => {
        state.draft = text
        document.dispatchEvent(new Event(streamEvent))
      }, async request => {
        if (!unlock) return
        const requestSignal = AbortSignal.any([chatSignal, AbortSignal.timeout(7000)])
        let result
        try {
          result = await unlock.read(request, requestSignal)
        } catch {
          result = { error: "当前内容读取失败" }
        }
        if (chatSignal.aborted) return
        if (!unlock.valid()) result = { error: "页面已切换或锁定" }
        await fetch("/api/starbud/chat/context", {
          method: "POST", cache: "no-store", signal: chatSignal,
          headers: { "Content-Type": "application/json", "X-Visitor-ID": user },
          body: JSON.stringify({ turn_id: request.turn_id, request_id: request.request_id, result }),
        })
      })
    } catch (error) {
      if (!signal.aborted) state.error = error instanceof Error && error.name === "Error" ? error.message : unavailable
    } finally {
      if (answer) await drainDraft()
      stopDraftFrames()
      shownDraft = ""
      const partial = !answer ? state.draft.trim() : ""
      state.pending = ""
      state.draft = ""
      if (recordedKind && (answer || partial)) {
        write(recordedKind, read(recordedKind).map(item =>
          item.id === turn.id ? { ...item, answer, partial: partial || undefined } : item,
        ))
      } else document.dispatchEvent(new Event(changeEvent))
    }
  }, { signal })
  input.addEventListener("input", refreshSend, { signal })
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
    event.preventDefault()
    if (!send.disabled) form.requestSubmit()
  }, { signal })
  document.addEventListener(changeEvent, () => {
    if (!dialog.open) return
    render()
    if (!state.pending) void refreshQuota()
  }, { signal })
  document.addEventListener(streamEvent, () => {
    if (!dialog.open) return
    if (!state.draft.startsWith(shownDraft)) {
      stopDraftFrames()
      shownDraft = ""
      paintDraft()
    }
    scheduleDraft()
  }, { signal })
  dialog.addEventListener("close", stopDraftFrames, { signal })
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopDraftFrames()
    else scheduleDraft()
  }, { signal })
  const updateAvatarIfOpen = () => { if (dialog.open) void refreshVisitorAvatar() }
  document.addEventListener("themechange", updateAvatarIfOpen, { signal })
  document.addEventListener(artalkIdentityChange, updateAvatarIfOpen, { signal })
  window.addEventListener("storage", event => {
    if (event.key === null || event.key === historyKeys.turns || event.key === historyKeys.privateTurns) {
      for (const kind of ["turns", "privateTurns"] as const) {
        if (event.key === null || event.key === historyKeys[kind] && event.newValue === null) state[kind] = []
      }
      if (dialog.open) {
        render()
        void refreshQuota()
      }
    }
    if (event.key === artalkUserStorageKey || event.key === null) updateAvatarIfOpen()
  }, { signal })
  signal.addEventListener("abort", () => {
    titleObserver.disconnect()
    clearTimeout(quotaTimer)
    stopDraftFrames()
  }, { once: true })
  return async () => {
    const ticket = ++opening
    refreshPageContext()
    void refreshVisitorAvatar()
    void refreshQuota()
    thread.removeAttribute("aria-busy")
    if (!starbudMarkdownReady()) {
      const loading = preloadStarbudMarkdown()
      if (hasMarkdown()) {
        thread.setAttribute("aria-busy", "true")
        await loading
        if (signal.aborted || ticket !== opening) return
        thread.removeAttribute("aria-busy")
      }
    }
    if (!dialog.open) return
    shownDraft = state.draft
    render(true)
  }
}
