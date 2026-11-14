import { readSiteSession } from "./siteSession"
import { showPasswordToast } from "./passwordFeedback"

type Session = { token: string; user: { name: string; email: string; link: string; is_admin: boolean } }
type Instance = { getEl?: () => HTMLElement; ctx?: {
  getUser?: () => { update: (data: object) => void; logout: () => void }
  inject?: (name: string) => unknown
  getApi?: () => { user: { getUserStatus: (fields: { name: string; email: string }) => Promise<{ data: { is_login?: boolean; is_admin?: boolean } }> } }
} }
const linkedKey = "quartz-artalk-linked"
let cached: Session | undefined
let expires = 0
let pending: Promise<Session> | undefined
let generation = 0
let current: Instance | undefined

function lockIdentity(instance: Instance | undefined, locked: boolean) {
  for (const input of instance?.getEl?.().querySelectorAll<HTMLInputElement>('.atk-main-editor input[name="name"], .atk-main-editor input[name="email"]') ?? []) {
    input.readOnly = locked
    if (locked) {
      input.setAttribute("aria-readonly", "true")
      input.tabIndex = -1
      if (document.activeElement === input) input.blur()
    } else {
      input.removeAttribute("aria-readonly")
      input.removeAttribute("tabindex")
    }
  }
}

function clearLinkedLogin(unlock = true) {
  cached = undefined; expires = 0; pending = undefined; generation++
  if (unlock) lockIdentity(current, false)
  if (localStorage.getItem(linkedKey) !== "true") return
  localStorage.removeItem(linkedKey)
  current?.ctx?.getUser?.().logout()
  // Artalk logout preserves visitor identity; a linked site administrator must
  // also clear that identity from the live editor and its persisted user data.
  current?.ctx?.getUser?.().update({ name: "", email: "", link: "", token: "", is_admin: false })
  for (const name of ["name", "email", "link"] as const) {
    const input = current?.getEl?.().querySelector<HTMLInputElement>(`.atk-main-editor input[name="${name}"]`)
    if (input) input.value = ""
  }
  localStorage.removeItem("ArtalkUser")
}

// All native administrator checks use this singleton, including API retries
// and the automatic check after an administrator email is entered.
export function useSiteArtalkAdminVerifier(instance: Instance) {
  type Options = { onSuccess?: () => void; onCancel?: () => void }
  const checkers = instance.ctx?.inject?.("checkers") as { checkAdmin: (options: Options) => Promise<void> } | undefined
  if (!checkers) return () => {}
  let active = true
  checkers.checkAdmin = (options = {}) => {
    const result = (async () => {
      if (active && await syncArtalkAdminSession(instance) && active) {
        options.onSuccess?.()
        return
      }
      options.onCancel?.()
      if (active) showPasswordToast("管理员未验证", true)
      throw Error("Site administrator authentication required")
    })()
    // Some automatic Artalk checks do not attach a rejection handler.
    void result.catch(() => {})
    return result
  }
  return () => { active = false }
}

export function observeArtalkAdminLogout(instance: Instance & {
  on: (event: string, listener: (user: { token?: string }) => void) => void
  off: (event: string, listener: (user: { token?: string }) => void) => void
}) {
  const changed = (user: { token?: string }) => {
    if (user.token || localStorage.getItem(linkedKey) !== "true") return
    clearLinkedLogin(false)
  }
  instance.on("user-changed", changed)
  return () => instance.off("user-changed", changed)
}

export async function syncArtalkAdminSession(instance: Instance) {
  current = instance
  const version = generation
  let verifying = false
  try {
    const site = await readSiteSession()
    if (version !== generation || current !== instance) return
    if (!site.authenticated) { clearLinkedLogin(); return }
    lockIdentity(instance, true)
    if (!cached || Date.now() >= expires) {
      if (!pending) pending = fetch("/api/site/admin/comments-session", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: "{}",
        signal: AbortSignal.timeout(15000),
      }).then(async response => {
        if (!response.ok) throw Error("Artalk auto login unavailable")
        const value = await response.json() as Session
        if (!value.token || !value.user?.is_admin) throw Error("Invalid Artalk session")
        return value
      })
      const request = pending
      try {
        const result = await request
        if (version !== generation || current !== instance) return
        cached = result; expires = Date.now() + 10 * 60 * 1000
      } finally { if (pending === request) pending = undefined }
    }
    if (version !== generation || current !== instance || !cached) return
    const user = instance.ctx?.getUser?.()
    const api = instance.ctx?.getApi?.()
    if (!user || !api) throw Error("Artalk authentication API unavailable")
    // Verify through Artalk's own API client, proving that it sends the token.
    localStorage.setItem(linkedKey, "true")
    verifying = true
    user.update({ ...cached.user, is_admin: false, token: cached.token })
    const status = await api.user.getUserStatus({ name: cached.user.name, email: cached.user.email })
    if (version !== generation || current !== instance) return
    if (!status.data.is_login || !status.data.is_admin) {
      cached = undefined; expires = 0
      throw Error("Artalk did not confirm administrator login")
    }
    localStorage.setItem(linkedKey, "true")
    user.update({ ...cached.user, token: cached.token })
    verifying = false
    // Artalk fills editor identity fields on mount, not on later user updates.
    // Set values without input events: those events deliberately log the user out.
    for (const name of ["name", "email"] as const) {
      const input = instance.getEl?.().querySelector<HTMLInputElement>(`.atk-main-editor input[name="${name}"]`)
      if (input) input.value = cached.user[name]
    }
    return true
  } catch (error) {
    if (verifying && version === generation && current === instance) clearLinkedLogin(false)
    // A comment-service outage must not interrupt the site's administrator login.
    console.warn("Artalk auto login failed:", error instanceof Error ? error.message : "unknown error")
  }
}

document.addEventListener("stellar-auth-changed", event => {
  if (!(event as CustomEvent).detail?.authenticated) clearLinkedLogin()
  else {
    const version = generation
    // Other inline bundles invalidate the shared session cache for this event.
    // Read after all of those listeners finish, so they cannot cancel our read.
    queueMicrotask(() => {
      if (current && version === generation) void syncArtalkAdminSession(current)
    })
  }
})
