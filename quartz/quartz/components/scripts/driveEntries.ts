import { readSiteSettings } from "./siteSettings"
import { driveHref } from "./driveClient"
import { driveApiUrl, isDriveShareId } from "./openlistShared"
import { RequestCache, sharedState } from "./sharedRequest"

export type DriveEntry =
  | { kind: "guest"; title: string; description?: string }
  | {
      kind: "share"
      id: string
      title: string
      name?: string
      protected: boolean
      tags?: string[]
      comment?: boolean
      order?: number
      jellyfin?: boolean
      sharedAt?: string
    }
const state = sharedState("drive-entries:v1", () => ({
  requests: new RequestCache<DriveEntry[]>(30000, 1),
  listening: false,
}))
if (!state.listening) {
  state.listening = true
  document.addEventListener("drive-files-changed", () => {
    state.requests.clear()
  })
}
// Public entry names are available synchronously when navigating to a share,
// including a reload in this tab. File access still always checks the backend.
export const driveShareName = (id: string) => id
export function driveShareMedia(id: string): boolean | undefined {
  const entry = state.requests
    .peek("entries", true)
    ?.find((entry) => entry.kind === "share" && entry.id === id)
  if (entry?.kind === "share") return entry.jellyfin === true
  try {
    const value = sessionStorage.getItem(`drive-share-media:${id}`)
    return value === null ? undefined : value === "true"
  } catch {
    return undefined
  }
}
export function driveShareProtected(id: string): boolean {
  const entry = state.requests
    .peek("entries", true)
    ?.find((entry) => entry.kind === "share" && entry.id === id)
  if (entry?.kind === "share") return entry.protected
  try {
    return sessionStorage.getItem(`drive-share-protected:${id}`) === "true"
  } catch {
    return false
  }
}
export function fetchDriveEntries(): Promise<DriveEntry[]> {
  return state.requests
    .read("entries", async (signal) => {
      await readSiteSettings()
      const response = await fetch(driveApiUrl("public/quartz/entries"), {
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      })
      if (!response.ok) throw new Error("Share 入口暂不可用")
      const result = await response.json()
      if (!Array.isArray(result.entries)) throw new Error("Share 入口数据无效")
      const cached: DriveEntry[] = result.entries.filter(
        (entry: DriveEntry) =>
          typeof entry.title === "string" &&
          (entry.kind === "guest" || (entry.kind === "share" && isDriveShareId(entry.id))),
      )
      cached!.sort((a, b) =>
        a.kind === "guest"
          ? b.kind === "guest"
            ? 0
            : -1
          : b.kind === "guest"
            ? 1
            : (a.order ?? 100) - (b.order ?? 100) ||
              a.id.localeCompare(b.id, "zh-CN", { numeric: true }),
      )
      return cached
    })
    .then((entries) => {
      for (const entry of entries)
        if (entry.kind === "share") {
          try {
            sessionStorage.setItem(`drive-share-protected:${entry.id}`, String(entry.protected))
          } catch {}
          try {
            sessionStorage.setItem(`drive-share-media:${entry.id}`, String(entry.jellyfin === true))
          } catch {}
        }
      return entries
    })
}
export const driveEntryHref = (entry: DriveEntry) =>
  entry.kind === "guest" ? driveHref("guest") : driveHref("share", "/", entry.id)
