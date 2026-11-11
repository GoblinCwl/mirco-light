import { RequestCache, sharedState } from "./sharedRequest"
import { bilibiliVideoIcon } from "../../util/fileTypeIcons"
import type { Activity } from "./activityTimeline"
export type VideoItem = {
  test?: boolean
  availability?: "available" | "unavailable"
  unavailableReason?: string
  parts?: VideoDetail["pages"]
  bvid: string
  title: string
  cover: string
  description: string
  duration: number
  publishedAt: string | null
  play: number
  danmaku: number
  commentCount: number
  url: string
}
export type VideoCollection = {
  id: string
  title: string
  description: string
  kind: "season" | "series"
  cover: string
  bvids: string[]
}
export type VideoProfile = {
  mid: string
  name: string
  avatar: string
  description: string
  level: number | null
  followers: number | null
  following: number | null
  videos: number | null
  likes: number | null
  plays?: number | null
  updatedAt: string
}
export type VideoLibrary = {
  mid: string
  videos: VideoItem[]
  collections: VideoCollection[]
  updatedAt: string | null
  profile?: VideoProfile | null
  activities?: Activity[] | null
}
export type VideoStats = Record<
  "play" | "danmaku" | "like" | "coin" | "favorite" | "share",
  number | null
>
export type VideoDetail = {
  availability?: "available" | "unavailable"
  unavailableReason?: string
  stats?: VideoStats
  bvid: string
  description: string
  pages: { cid: number; page: number; title: string; duration: number }[]
}
export const videoIcon = bilibiliVideoIcon
export function videoHref(bvid = "", collection = "", page = 1) {
  const path = bvid
    ? `/Video/${encodeURIComponent(bvid)}/`
    : collection
      ? `/Video/collection/${encodeURIComponent(collection)}/`
      : "/Video/"
  const params = new URLSearchParams()
  if (bvid && collection) params.set("collection", collection)
  if (bvid && page > 1) params.set("p", String(page))
  return path + (params.size ? "?" + params : "")
}
export function videoRoute(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean)
  const bvid = parts[0] === "Video" && /^BV[0-9A-Za-z]{10}$/.test(parts[1] || "") ? parts[1] : ""
  const collection =
    parts[0] === "Video" && parts[1] === "collection"
      ? decodeURIComponent(parts[2] || "")
      : url.searchParams.get("collection") || ""
  const page = Number(url.searchParams.get("p"))
  const valid =
    parts[0] === "Video" &&
    (parts.length === 1 ||
      (Boolean(bvid) && parts.length === 2) ||
      (parts[1] === "collection" && Boolean(collection) && parts.length === 3))
  return {
    bvid,
    collection,
    valid,
    page: Number.isSafeInteger(page) && page > 0 && page <= 1000 ? page : 1,
  }
}
const publishedTime = (video: VideoItem) => Date.parse(video.publishedAt || "") || 0
const newestVideo = (a: VideoItem, b: VideoItem) => publishedTime(b) - publishedTime(a)
export function collectionVideos(library: VideoLibrary, collection: VideoCollection) {
  const videos = new Map(library.videos.map((video) => [video.bvid, video]))
  return collection.bvids
    .map((bvid) => videos.get(bvid))
    .filter((video): video is VideoItem => Boolean(video))
    .sort(newestVideo)
}
export function standaloneVideos(library: VideoLibrary) {
  const grouped = new Set(library.collections.flatMap((collection) => collection.bvids))
  return library.videos.filter((video) => !grouped.has(video.bvid))
}
export function seriesLibrary(library: VideoLibrary): VideoLibrary {
  const collections = library.collections.filter(
    (item) => item.kind === "series" && item.id !== "other",
  )
  const other = standaloneVideos({ ...library, collections })
  if (other.length)
    collections.push({
      id: "other",
      title: "其他",
      kind: "series",
      description: "",
      cover: "",
      bvids: other.map((video) => video.bvid),
    })
  const latest = (group: VideoCollection) =>
    collectionVideos(library, group).reduce(
      (time, video) => Math.max(time, publishedTime(video)),
      0,
    )
  const timestamps = new Map(collections.map((group) => [group.id, latest(group)]))
  collections.sort(
    (a, b) =>
      Number(a.id === "other") - Number(b.id === "other") ||
      timestamps.get(b.id)! - timestamps.get(a.id)!,
  )
  return { ...library, videos: [...library.videos].sort(newestVideo), collections }
}
export function videoPlayerUrl(bvid: string, page = 1) {
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) throw new Error("无效的视频编号")
  return `https://player.bilibili.com/player.html?${new URLSearchParams({ bvid, p: String(page), autoplay: "0", t: "0", muted: "0", danmaku: "1", poster: "1" })}`
}
const state = sharedState("video-library:v2", () => ({
  requests: new RequestCache<VideoLibrary>(30000, 1),
  listening: false,
}))
if (typeof document !== "undefined" && !state.listening) {
  state.listening = true
  document.addEventListener("stellar-data-changed", (event) => {
    if ((event as CustomEvent).detail?.table?.startsWith("video")) state.requests.clear()
  })
}
export function readVideoLibrary() {
  return state.requests.read("library", async (signal) => {
    const response = await fetch("/api/video/library", {
      credentials: "omit",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    })
    if (!response.ok) throw Error("视频目录暂不可用")
    const raw = (await response.json()) as VideoLibrary
    if (!Array.isArray(raw.videos) || !Array.isArray(raw.collections))
      throw Error("视频目录暂不可用")
    return seriesLibrary(raw)
  })
}
