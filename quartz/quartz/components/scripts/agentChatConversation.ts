import { artalkIdentityChange, artalkUserStorageKey, readCachedArtalkIdentity } from "./artalkIdentity"
import { identicon, resolveCommentAvatar } from "./identicon"
import { preloadStarbudMarkdown, renderStarbudMarkdown, starbudMarkdownReady } from "./starbudMarkdown"
import { sharedState } from "./sharedRequest"
import { browserId } from "./visitorRecording"

type Turn = { id: string; question: string; answer?: string; partial?: string }
const changeEvent = "starbud-conversation"
const streamEvent = "starbud-stream"
const unavailable = "星芽暂时无法回复，请稍后再试"
const exhaustedPlaceholder = "今日次数已用完，零点恢复"

async function readReply(response: Response, update: (text: string) => void) {
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
  const state = sharedState(storage, () => ({ pending: "", draft: "", error: "", turns: [] as Turn[] }))
  const thread = dialog.querySelector<HTMLElement>(".agent-chat-thread")!
  const history = dialog.querySelector<HTMLElement>(".agent-chat-history")!
  const form = dialog.querySelector<HTMLFormElement>(".agent-chat-composer")!
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
  let opening = 0

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

  const read = () => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(storage) || "null")
      if (Array.isArray(parsed)) {
        state.turns = parsed.filter(turn => turn && typeof turn.id === "string" && typeof turn.question === "string" &&
          (turn.answer === undefined || typeof turn.answer === "string") &&
          (turn.partial === undefined || typeof turn.partial === "string"))
      }
    } catch { /* Keep the in-memory history when browser storage is unavailable. */ }
    return state.turns
  }
  const hasMarkdown = () => !!state.draft || read().some(turn => turn.answer || turn.partial)
  if (hasMarkdown()) void preloadStarbudMarkdown()
  const write = (turns: Turn[]) => {
    state.turns = turns
    try { localStorage.setItem(storage, JSON.stringify(turns)) } catch { /* The current tab keeps its in-memory history. */ }
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
    if (state.draft) {
      liveRow.classList.remove("is-pending")
      paintReply(bubble, state.draft)
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
  const refreshSend = () => {
    const exhausted = remaining === 0
    input.disabled = exhausted
    entry.toggleAttribute("data-empty", exhausted || input.value === "")
    placeholder.textContent = exhausted ? exhaustedPlaceholder : defaultPlaceholder
    input.setAttribute("aria-placeholder", placeholder.textContent)
    send.disabled = !!state.pending || exhausted || !input.value.trim()
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
    for (const turn of read()) {
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
  }

  form.addEventListener("submit", async event => {
    event.preventDefault()
    const question = input.value.trim()
    if (!question || state.pending || remaining === 0) return
    const turns = read()
    const context: { role: string; text: string }[] = []
    let bytes = 0
    const encoder = new TextEncoder()
    for (const turn of [...turns].reverse()) {
      if (!turn.answer) continue
      bytes += encoder.encode(turn.question).length + encoder.encode(turn.answer).length
      if (bytes > 36000 || context.length >= 12) break
      context.unshift({ role: "user", text: turn.question }, { role: "assistant", text: turn.answer })
    }
    const turn: Turn = { question, id: crypto.randomUUID() }
    state.pending = turn.id
    state.draft = ""
    state.error = ""
    input.value = ""
    write([...turns, turn])
    thread.scrollTop = thread.scrollHeight
    let answer: string | undefined
    try {
      const page = new URL(location.href)
      const selectedTag = /^\/tags\/?$/.test(page.pathname) ? page.searchParams.get("tag") : null
      const pageURL = page.pathname + (selectedTag ? `?${new URLSearchParams({ tag: selectedTag })}` : "")
      const response = await fetch("/api/starbud/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream", "X-Visitor-ID": user },
        body: JSON.stringify({ message: question, page_url: pageURL, history: context }),
        signal: AbortSignal.timeout(110000),
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
      })
    } catch (error) {
      state.error = error instanceof Error && error.name === "Error" ? error.message : unavailable
    } finally {
      const partial = !answer ? state.draft.trim() : ""
      state.pending = ""
      state.draft = ""
      if (answer || partial) {
        write(read().map(item => item.id === turn.id ? { ...item, answer, partial: partial || undefined } : item))
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
    if (!dialog.open || liveFrame) return
    liveFrame = window.setTimeout(() => {
      liveFrame = 0
      paintDraft()
    }, 65)
  }, { signal })
  const updateAvatarIfOpen = () => { if (dialog.open) void refreshVisitorAvatar() }
  document.addEventListener("themechange", updateAvatarIfOpen, { signal })
  document.addEventListener(artalkIdentityChange, updateAvatarIfOpen, { signal })
  window.addEventListener("storage", event => {
    if (event.key === storage || event.key === null) {
      if (dialog.open) {
        render()
        void refreshQuota()
      }
    }
    if (event.key === artalkUserStorageKey || event.key === null) updateAvatarIfOpen()
  }, { signal })
  signal.addEventListener("abort", () => {
    clearTimeout(quotaTimer)
    clearTimeout(liveFrame)
  }, { once: true })
  return async () => {
    const ticket = ++opening
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
    render(true)
  }
}
