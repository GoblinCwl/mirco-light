import { normalizeSubtitleAppearance, type SubtitleAppearance } from "./subtitleAppearance"
import { siteSettings } from "./siteSettings"
export type VideoScope = { program?: string; season?: string }
export type VideoPreferences = {
  volume?: number; muted?: boolean; quality?: string; playbackRate?: number; aspectRatio?: string; pgsRender?: boolean; subtitleBurnIn?: string
  subtitleAppearance?: SubtitleAppearance
  skipIntroOutro?: boolean; subtitleDelay?: number; audio?: string; subtitle?: string; subtitleStyle?: { scale: number; x: number; y: number; bold?: boolean }; danmuku?: Record<string, unknown>
}
type Saved = { global: VideoPreferences; programs: Record<string, VideoPreferences>; seasons: Record<string, VideoPreferences> }
const storageKey = "quartz-video-preferences:v1"
function saved(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "{}")
    return { global: value.global || {}, programs: value.programs || {}, seasons: value.seasons || {} }
  } catch { return { global: {}, programs: {}, seasons: {} } }
}
export function readVideoPreferences(scope: VideoScope): VideoPreferences {
  const value = saved()
  const defaults = siteSettings(), mobile = matchMedia("(max-width: 600px)").matches
  const danmuku = { opacity: defaults["danmuku.opacity"] ?? .7, fontSize: defaults[mobile ? "danmuku.mobileSize" : "danmuku.pcSize"] ?? (mobile ? 16 : 25), speed: defaults[mobile ? "danmuku.mobileSpeed" : "danmuku.pcSpeed"] ?? (mobile ? 5 : 10), margin: [0, defaults["danmuku.area"] ?? "50%"], ...value.global.danmuku }
  return { volume: Number(defaults["video.volume"] ?? .7), quality: String(defaults["video.quality"] ?? "lowest"), pgsRender:defaults['video.pgsRender']===true, subtitleBurnIn:String(defaults['video.subtitleBurnIn']||'auto'), skipIntroOutro: defaults["video.skip"] === true, ...value.global, ...(scope.program ? value.programs[scope.program] : {}), ...(scope.season ? value.seasons[scope.season] : {}), subtitleAppearance: normalizeSubtitleAppearance(value.global.subtitleAppearance), danmuku }
}
export function saveVideoPreferences(scope: VideoScope, patch: VideoPreferences) {
  const value = saved(), global = value.global
  const program = scope.program ? value.programs[scope.program] ||= {} : undefined
  const season = scope.season ? value.seasons[scope.season] ||= {} : /^(jellyfin:movie:|file:)/.test(scope.program || "") ? program : undefined
  if (patch.subtitleAppearance && typeof patch.subtitleAppearance === "object") global.subtitleAppearance = normalizeSubtitleAppearance(patch.subtitleAppearance)
  if (typeof patch.volume === "number" && Number.isFinite(patch.volume)) global.volume = Math.max(0, Math.min(2, patch.volume))
  if (typeof patch.muted === "boolean") global.muted = patch.muted
  if (typeof patch.skipIntroOutro === "boolean") global.skipIntroOutro = patch.skipIntroOutro
  if (season && typeof patch.subtitleDelay === "number" && Number.isFinite(patch.subtitleDelay) && Math.abs(patch.subtitleDelay) <= 60) season.subtitleDelay = Math.round(patch.subtitleDelay * 10) / 10
  if (typeof patch.quality === "string" && /^(auto|original|\d{3,4})$/.test(patch.quality)) {
    global.quality = patch.quality
    if (season) season.quality = patch.quality
  }
  if (typeof patch.playbackRate === "number" && patch.playbackRate >= .25 && patch.playbackRate <= 4) {
    if (program) program.playbackRate = patch.playbackRate
    if (season) season.playbackRate = patch.playbackRate
  }
  if (season && typeof patch.aspectRatio === "string" && /^(default|\d{1,2}:\d{1,2})$/.test(patch.aspectRatio)) season.aspectRatio = patch.aspectRatio
  for (const key of ["audio", "subtitle"] as const) if (season && typeof patch[key] === "string" && patch[key]!.length < 2048) season[key] = patch[key]
  if (season && patch.subtitleStyle && typeof patch.subtitleStyle === "object") {
    const { scale, x, y, bold } = patch.subtitleStyle
    if ([scale, x, y].every(n => typeof n === "number" && Number.isFinite(n)) && scale >= .5 && scale <= 2 && Math.abs(x) <= 50 && Math.abs(y) <= 50) season.subtitleStyle = { scale, x, y, bold: bold === true }
  }
  if (patch.danmuku && typeof patch.danmuku === "object") {
    const options = patch.danmuku, clean: Record<string, unknown> = {}
    for (const [key, min, max] of [["opacity", 0, 1], ["fontSize", 8, 60], ["speed", 1, 20]] as const) {
      const n = options[key]; if (typeof n === "number" && Number.isFinite(n) && n >= min && n <= max) clean[key] = n
    }
    for (const key of ["visible", "antiOverlap", "synchronousPlayback"]) if (typeof options[key] === "boolean") clean[key] = options[key]
    if (Array.isArray(options.margin) && options.margin.length === 2 && options.margin.every(n => typeof n === "number" && n >= 0 && n <= 10000 || typeof n === "string" && /^\d{1,3}%$/.test(n))) clean.margin = options.margin
    if (Array.isArray(options.modes)) clean.modes = options.modes.filter(n => [0, 1, 2].includes(n))
    global.danmuku = { ...global.danmuku, ...clean }
  }
  try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* Storage may be disabled or full. */ }
}
export function fallbackVideoScope(path: string, base = ""): VideoScope {
  const parts = path.split("/").filter(Boolean); parts.pop()
  const folder = parts.at(-1) || ""
  const season = /^(?:season[\s._-]*\d+|s\d{1,2}|第.+季)$/i.test(folder)
  return season ? { season: `path:${base}/${parts.join("/")}`, program: `path:${base}/${parts.slice(0, -1).join("/")}` }
    : { program: `file:${base}${path}` }
}
