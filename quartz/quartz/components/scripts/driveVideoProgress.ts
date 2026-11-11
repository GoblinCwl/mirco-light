export type VideoProgress = { position: number; duration: number; updated: number }
const key = "quartz-video-progress:v1"
const maxEntries = 500
function records(): Record<string, VideoProgress> {
  try { const value = JSON.parse(localStorage.getItem(key) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {} } catch { return {} }
}
export function readVideoProgress(identity: string): number {
  const entry = records()[identity]
  return entry && Number.isFinite(entry.position) && Number.isFinite(entry.duration) && entry.position >= 5 && entry.position < entry.duration - Math.min(30, entry.duration * .02) ? entry.position : 0
}
export function saveVideoProgress(identity: string, position: number, duration: number, ended = false) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) return
  const values = records()
  if (ended || duration - position <= Math.min(30, duration * .02)) delete values[identity]
  else if (position >= 5) values[identity] = { position, duration, updated: Date.now() }
  else delete values[identity]
  const sorted = Object.entries(values).sort((a, b) => b[1].updated - a[1].updated).slice(0, maxEntries)
  try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(sorted))) } catch { /* Storage may be unavailable. */ }
}
