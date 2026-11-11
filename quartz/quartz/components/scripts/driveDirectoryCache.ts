import { drivePassword, driveRequest, driveToken } from "./driveClient"
import type { DriveFile } from "./openlistShared"

export const DIRECTORY_CACHE_TTL = 60_000
const LIMIT = 128
export type DirectoryPage = { content: DriveFile[] | null; total: number }
const cache = new Map<string, { at: number; value: DirectoryPage }>()
const pending = new Map<string, Promise<DirectoryPage>>()
let generation = 0
let requests = new AbortController()

export function clearDriveDirectoryCache() {
  generation++; requests.abort(); requests = new AbortController()
  cache.clear(); pending.clear()
}
export function readDriveDirectory(path: string, page: number, signal: AbortSignal, share = ""): Promise<DirectoryPage> {
  const password = drivePassword(share ? "share" : "storage", share, path), token = driveToken()
  const key = JSON.stringify([share ? "" : token, share, path, page, password])
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < DIRECTORY_CACHE_TTL) {
    cache.delete(key); cache.set(key, hit)
    return Promise.resolve(hit.value)
  }
  const inflight = pending.get(key)
  if (inflight) return inflight
  const epoch = generation, requestSignal = AbortSignal.any([signal, requests.signal])
  const request: Promise<DirectoryPage> = (async () => {
    const value: DirectoryPage = !share && path === "/"
      ? { content: (await driveRequest<{ name: string; modified: string }[]>("fs/dirs", { path: "/", password: "" }, { token, signal: requestSignal })).map(file => ({ ...file, is_dir: true, size: 0 })), total: 0 }
      : await driveRequest<DirectoryPage>("fs/list", { path: share ? `/@s/${share}${path === "/" ? "" : path}` : path, password, page, per_page: 100, refresh: false }, { token, anonymous: Boolean(share), signal: requestSignal })
    if (generation === epoch && token === driveToken() && !requestSignal.aborted) {
      cache.delete(key); cache.set(key, { at: Date.now(), value })
      while (cache.size > LIMIT) cache.delete(cache.keys().next().value!)
    }
    if (generation !== epoch || token !== driveToken() || requestSignal.aborted) throw new DOMException("Directory cache invalidated", "AbortError")
    return value
  })().finally(() => { if (pending.get(key) === request) pending.delete(key) })
  pending.set(key, request)
  return request
}
