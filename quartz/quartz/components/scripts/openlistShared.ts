import {readSiteSettings,siteSettings} from './siteSettings'
export type DriveFile = { name: string; is_dir: boolean; size: number; modified: string; created?: string; sign?: string; thumb?: string; type?: number; raw_url?: string; provider?: string }
export { isDriveShareId } from "../../util/driveRoutes.mjs"
export let DRIVE_ORIGIN = "https://drive.goblincwl.site"
export let MEDIA_ORIGIN = "https://media.goblincwl.site"
const applyOrigins=()=>{const values=siteSettings();DRIVE_ORIGIN=String(values['api.openlist.publicUrl']||'https://drive.goblincwl.site').replace(/\/+$/,'');MEDIA_ORIGIN=String(values['api.jellyfin.publicUrl']||'https://media.goblincwl.site').replace(/\/+$/,'')}
if(typeof document!=='undefined'){document.addEventListener('site-settings-changed',applyOrigins);void readSiteSettings().then(applyOrigins)}
// Media bridge requests keep their OpenList authorization payload, but use
// the media proxy for lookup, subtitles, danmaku and playback traffic.
export const driveApiUrl = (route: string) => `${route.startsWith("public/quartz/jellyfin/") ? MEDIA_ORIGIN : DRIVE_ORIGIN}/api/${route}`

export function normalizeDrivePath(value: string): string {
  const parts: string[] = []
  for (const part of value.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") parts.pop()
    else if (!/[\u0000-\u001f\u007f]/.test(part)) parts.push(part)
  }
  return `/${parts.join("/")}`
}
export const joinDrivePath = (parent: string, name: string) => normalizeDrivePath(`${parent}/${name}`)
export function driveDownloadUrl(path: string, sign?: string): string {
  const url = `${DRIVE_ORIGIN}/d${normalizeDrivePath(path).split("/").map(encodeURIComponent).join("/")}`
  return sign ? `${url}?${new URLSearchParams({ sign })}` : url
}
export function drivePreviewKind(name: string): "image" | "video" | "audio" | "pdf" | "text" | "other" {
  const extension = name.split(".").pop()?.toLowerCase() || ""
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico"].includes(extension)) return "image"
  if (["mp4", "webm", "ogv", "m4v", "mov"].includes(extension)) return "video"
  if (["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"].includes(extension)) return "audio"
  if (extension === "pdf") return "pdf"
  if (["txt", "md", "markdown", "json", "js", "ts", "tsx", "jsx", "css", "scss", "html", "xml", "yaml", "yml", "toml", "ini", "log", "csv", "py", "go", "rs", "java", "sh", "sql", "svg"].includes(extension)) return "text"
  return "other"
}
export function sortDriveFiles(files: DriveFile[], sort: string): DriveFile[] {
  return [...files].sort((a, b) => Number(b.is_dir) - Number(a.is_dir) ||
    (sort === "modified" ? (Date.parse(b.modified) || 0) - (Date.parse(a.modified) || 0) :
      sort === "size" ? b.size - a.size : 0) || a.name.localeCompare(b.name, "zh-CN", { numeric: true }))
}
export function driveSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4)
  return `${(bytes / 1024 ** index).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][index]}`
}
