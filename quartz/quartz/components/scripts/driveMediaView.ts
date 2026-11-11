import { normalizeMediaOverview, renderMediaOverview, resetMediaOverview } from "./mediaOverview"
import { driveRequest } from "./driveClient"
import { fileIcon, node } from "./driveUi"
import { RequestCache, sharedState } from "./sharedRequest"

export type MediaInfo = { title: string; type: "Movie" | "Series" | "Season" | "Episode"; collectionScope?: string; year?: number; seasonCount?: number; episodeCount?: number; overview?: string; index?: number; season?: number; duration?: number; image?: string; poster?: string; posterKey?: string; backdrop?: string; jellyfinUrl?: string; tmdbUrl?: string }
export type MediaCollection = { id:string; title:string; items:{ id:string; title:string; year?:number; poster?:string; path:string; directory:boolean }[] }
const state = sharedState('drive-media:v1', () => ({ requests: new RequestCache<MediaListing>(60000), collections: new RequestCache<MediaCollection[]>(60000, 100), movieTargets: new Map<string, { directory: boolean; path: string }>(), listening: false }))
export async function fetchDriveCollections(path:string,password:string,scope:string,signal:AbortSignal,refresh=false){
  const key=JSON.stringify([path.split('/').slice(0,3).join('/'),password,scope])
  return state.collections.read(key, async requestSignal => {
    const result=await driveRequest<{collections:MediaCollection[]}>("public/quartz/jellyfin/collections",{path,password},{anonymous:true,signal:requestSignal})
    return result.collections
  }, {signal,refresh})
}
export type MediaListing = { current?: MediaInfo; breadcrumbs?: { path: string; media?: MediaInfo }[]; entries: { name: string; media?: MediaInfo }[]; autoFile?: string; autoDirectory?: string; collapseMovieParent?: boolean }
export const movieTreeKey = (share: string, path: string) => JSON.stringify([share, path])
export const movieTreeTargets = state.movieTargets
if (!state.listening) {
  state.listening = true
  document.addEventListener("drive-movie-tree-changed", event => {
    const { key, target } = (event as CustomEvent<{ key: string; target: { directory: boolean; path: string } }>).detail
    movieTreeTargets.set(key, target)
  })
  for (const event of ['drive-files-changed', 'drive-auth-change', 'drive-directory-unlocked']) document.addEventListener(event, () => {
    state.requests.clear(); state.collections.clear()
    if (event === 'drive-files-changed') movieTreeTargets.clear()
  })
}
export function rememberMovieTreeTarget(share: string, path: string, directory: boolean, target = path) {
  const key = movieTreeKey(share, path), prior = movieTreeTargets.get(key)
  if (prior?.directory === directory && prior.path === target) return
  movieTreeTargets.set(key, { directory, path: target })
  document.dispatchEvent(new CustomEvent("drive-movie-tree-changed", { detail: { key, target: { directory, path: target } } }))
}
export async function fetchDriveMedia(path: string, password: string, signal: AbortSignal, refresh = false) {
  const key = JSON.stringify([path, password])
  return state.requests.read(key, requestSignal => driveRequest<MediaListing>("public/quartz/jellyfin/media", { path, password }, { anonymous: true, signal: AbortSignal.any([requestSignal, AbortSignal.timeout(20000)]) }), {signal,refresh})
}
export const isMediaSidecar = (name: string) => /\.(xml|ass|ssa|srt|vtt|sub|idx|nfo|lrc|bif)$/i.test(name) || /^(?:poster|folder|cover|fanart|backdrop|banner|landscape|logo|clearlogo|disc|season\d+[-_.]poster|.*[-_.](?:poster|fanart|thumb))\.(?:jpe?g|png|webp|avif)$/i.test(name)
function mediaDetails(info?: MediaInfo) {
  if (!info) return []
  if (info.type === "Episode") return [info.index != null ? `第 ${info.index} 集` : "", info.duration ? `${info.duration} 分钟` : ""].filter(Boolean)
  return [info.year, ["Series", "Season"].includes(info.type) ? info.episodeCount != null ? `${info.episodeCount} 集` : "" : info.duration ? `${info.duration} 分钟` : ""].filter(Boolean).map(String)
}
export function renderDriveMedia(root: HTMLElement, entries: { displayName?: string; name: string; target: string; directory: boolean; media?: MediaInfo }[], signal: AbortSignal, append = false) {
  if (!append) root.replaceChildren()
  const grid = root.querySelector<HTMLElement>(".drive-media-grid") || node("div", "", "drive-media-grid")
  for (const entry of entries) {
    const info = entry.media, item = node("article", "", `drive-media-card${info?.type === "Episode" ? " is-episode" : ""}`)
    item.dataset.driveEntry = entry.target
    const link = node("a", "", "internal drive-media-poster drive-media-artwork"); link.href = entry.target; link.dataset.noPopover = "true"; link.dataset.driveHover = "true"; link.setAttribute("aria-label", entry.displayName || info?.title || entry.name)
    const fallback = fileIcon(entry.directory ? "folder" : "video")
    link.append(fallback)
    if (info?.image) {
      const image = node("img"); image.alt = info.title; image.loading = "lazy"; image.decoding = "async"; image.referrerPolicy = "no-referrer"
      link.classList.add("is-media-loading"); link.setAttribute("aria-busy", "true"); fallback.hidden = true
      image.style.opacity = "0"
      const finish = () => { link.classList.remove("is-media-loading"); link.setAttribute("aria-busy", "false") }
      image.addEventListener("load", async () => {
        try { await image.decode() } catch { /* The loaded image is still usable. */ }
        if (signal.aborted) return
        image.style.removeProperty("opacity"); finish()
      }, { signal })
      image.addEventListener("error", () => { image.remove(); fallback.hidden = false; finish() }, { signal })
      link.append(image)
      image.src = info.image
    }
    const label = node("a", entry.displayName || info?.title || entry.name, "internal drive-media-title"); label.href = entry.target; label.dataset.noPopover = "true"; label.dataset.driveHover = "true"; label.title = entry.displayName || info?.title || entry.name
    const detail = mediaDetails(info), caption = node("div", "", "drive-media-caption")
    caption.append(label)
    if (detail.length) { const subtitle = node("small", "", "drive-media-detail"); subtitle.append(...detail.map(value => node("span", value))); caption.append(subtitle) }
    if (info?.type === "Movie" && !entry.directory && info.title !== entry.name) caption.append(node("small", entry.name, "drive-media-source"))
    item.append(link, caption)
    grid.append(item)
  }
  if (!grid.isConnected) root.append(grid)
}
export function renderMediaSummary(root: HTMLElement, info?: MediaInfo, overviewRoot?: HTMLElement, options: { reserveOverview?: boolean; signal?: AbortSignal } = {}) {
  root.replaceChildren(); root.hidden = !info
  if (overviewRoot) resetMediaOverview(overviewRoot, options.reserveOverview)
  root.dataset.mediaType = info?.type || ""
  if (!info) return
  const text = node("div"), details = mediaDetails(info)
  if (details.length) { const subtitle = node("p", "", "drive-media-detail"); subtitle.append(...details.map(value => node("span", value))); text.append(subtitle) }
  const overview = normalizeMediaOverview(info.overview || "")
  if (overviewRoot) {
    renderMediaOverview(overviewRoot, overview || "暂无简介", { reserve: options.reserveOverview, signal: options.signal })
  } else if (overview) text.append(node("p", overview, "drive-media-overview"))
  root.append(text)
  root.hidden = !text.childElementCount
}
