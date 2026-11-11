// Like encrypted articles, credentials persist on this origin with an explicit expiry.
export const DRIVE_CREDENTIAL_TTL = 12 * 60 * 60 * 1000
export const DRIVE_AUTH_KEY = "openlist-token"
export const DRIVE_SHARE_PREFIX = "quartz-drive-share:"
type Entry = { value: string; expires: number }
const volatile = new Map<string, Entry>()

function remove(key: string) {
  volatile.delete(key)
  try { localStorage.removeItem(key) } catch { /* Storage may be unavailable. */ }
}
function read(key: string): string | undefined {
  let entry = volatile.get(key)
  try {
    const raw = localStorage.getItem(key)
    if (!entry && raw) {
      try { entry = JSON.parse(raw) } catch { remove(key); return }
    }
  } catch { /* Fall back to an expiring in-memory entry. */ }
  if (!entry) return
  if (typeof entry.value !== "string" || !entry.value || !Number.isFinite(entry.expires) || entry.expires <= Date.now()) { remove(key); return }
  return entry.value
}
function write(key: string, value: string) {
  if (!value) { remove(key); return }
  const entry = { value, expires: Date.now() + DRIVE_CREDENTIAL_TTL }
  try { localStorage.setItem(key, JSON.stringify(entry)); volatile.delete(key) }
  catch { volatile.set(key, entry) }
}

export const readDriveToken = () => read(DRIVE_AUTH_KEY) || ""
export const writeDriveToken = (token: string) => write(DRIVE_AUTH_KEY, token)
export const readDriveShareCode = (share: string) => read(DRIVE_SHARE_PREFIX + share) || ""
export const writeDriveShareCode = (share: string, value: string) => write(DRIVE_SHARE_PREFIX + share, value)
export const clearDriveShareCode = (share: string) => remove(DRIVE_SHARE_PREFIX + share)
export function clearDriveShareCodes() {
  for (const key of volatile.keys()) if (key.startsWith(DRIVE_SHARE_PREFIX)) volatile.delete(key)
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index)
      if (key?.startsWith(DRIVE_SHARE_PREFIX)) localStorage.removeItem(key)
    }
  } catch {}
}
