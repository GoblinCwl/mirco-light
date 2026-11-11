import { DRIVE_ORIGIN, drivePreviewKind, type DriveFile } from "./openlistShared"
export type PreviewSettings = Record<string, string | boolean | undefined>
export type PreviewChoice = { key: string; name: string; scheme?: string; external?: boolean }
export type PreviewFile = DriveFile & { type?: number; raw_url?: string; provider?: string }
const isTrue = (settings: PreviewSettings, key: string, fallback = false) => settings[key] === undefined ? fallback : String(settings[key]) === "true"
export function configuredPreviews(name: string, value: string | boolean | undefined, external = false): PreviewChoice[] {
  if (typeof value !== "string") return []
  try {
    const extension = name.split(".").at(-1)!.toLowerCase(), result: PreviewChoice[] = []
    for (const [extensions, renderers] of Object.entries(JSON.parse(value))) {
      let matches = extensions.split(",").map(x => x.trim().toLowerCase()).includes(extension)
      if (extensions.startsWith("/")) {
        const end = extensions.lastIndexOf("/")
        matches = new RegExp(extensions.slice(1, end), extensions.slice(end + 1)).test(extension)
      }
      if (!matches || !renderers || typeof renderers !== "object") continue
      for (const [label, scheme] of Object.entries(renderers)) if (typeof scheme === "string") {
        if (/^google$/i.test(label.trim()) || /^https?:\/\/(?:docs|drive)\.google\.com\//i.test(scheme.trim())) continue
        result.push({ key: `${external ? "external" : "iframe"}-${label}`, name: label, scheme, external })
      }
    }
    return result
  } catch { return [] }
}
export function previewChoices(file: PreviewFile, settings: PreviewSettings, share: boolean, archiveAllowed: boolean): PreviewChoice[] {
  const result: PreviewChoice[] = [], later: PreviewChoice[] = []
  const extension = file.name.split(".").at(-1)!.toLowerCase()
  const type = file.type ?? ({ video: 2, audio: 3, text: 4, image: 5 }[drivePreviewKind(file.name) as string] ?? 0)
  const add = (key: string, name: string) => result.push({ key, name })
  if (!share || isTrue(settings, "share_preview", true)) {
    if (extension === "pdf") { add("jit", "JitViewer"); add("pdf_native", "浏览器 PDF 预览"); add("pdf", "PDF 渲染器") }
    else if (["docx", "xlsx", "pptx", "csv", "tsv", "ofd"].includes(extension)) add("jit", "JitViewer")
    if (extension === "html" || extension === "htm") add("html", "HTML")
    if (type === 2 && /^Aliyundrive(Open)?$/.test(file.provider || "")) add("aliyun_video", "阿里云转码")
    if (type === 4) add("markdown", "Markdown 渲染器")
    if (extension === "swf") add("flash", "Flash")
    if (type === 4) add("markdown_with_word_wrap", "Markdown 渲染器（带换行）")
    if (extension === "url") add("url_open", "网址快捷方式")
    if (type === 4 || extension === "url") add("text_editor", "文本编辑器")
    if (type === 5 || ["heic", "heif", "avif", "vvc", "avc"].includes(extension)) add("image", "图片")
    if (type === 2) add("video", "视频播放器")
    if (type === 3) add("audio", "音乐播放器")
    if (extension === "pptx") add("ppt", "PowerPoint")
    if (extension === "xlsx") add("xls", "Excel")
    if (extension === "docx") add("doc", "Word")
    if (extension === "cast") add("asciinema", "终端录屏")
    if (type === 2) add("video360", "360° 视频")
    if (extension === "torrent") add("torrent", "种子信息")
    if (archiveAllowed && /\.(zip|7z|rar|tar|gz|bz2|xz|tgz|zst|iso|cab|arj|lzma|lz4|br)$/i.test(file.name)) {
      const choice = { key: "archive", name: "压缩包" }
      if (isTrue(settings, share ? "share_preview_archives_by_default" : "preview_archives_by_default", !share)) result.push(choice)
      else later.push(choice)
    }
  }
  result.push(...configuredPreviews(file.name, settings.iframe_previews), ...configuredPreviews(file.name, settings.external_previews, true))
  const download = { key: "download", name: "文件" }
  if (!["jit", "pdf_native"].includes(result[0]?.key) && (isTrue(settings, share ? "share_preview_download_by_default" : "preview_download_by_default") || type === 4 && file.size >= 1024 * 1024)) {
    result.unshift(download)
  } else if (!result.length && !later.length && file.size < 1024 * 1024) {
    result.push(download)
    if ((!share || isTrue(settings, "share_preview", true)) && !["ipa", "tipa"].includes(extension)) result.push({ key: "markdown", name: "Markdown 渲染器" }, { key: "markdown_with_word_wrap", name: "Markdown 渲染器（带换行）" }, { key: "text_editor", name: "文本编辑器" })
  } else result.push(download)
  return result.concat(later)
}
export function nativePdfUrl(direct: string): string {
  const url = new URL(direct)
  if (url.origin !== DRIVE_ORIGIN) throw new Error("无效的 PDF 预览地址")
  url.pathname = url.pathname.replace(/^\/d\//, "/p/")
  url.searchParams.delete("download")
  url.searchParams.set("quartz_pdf", "1")
  return url.href
}
export function previewScheme(scheme: string, file: PreviewFile, direct: string): string {
  let url = scheme.replaceAll("$name", encodeURIComponent(file.name))
  url = url.replace(/\$[eb_]*(?:durl|url)/g, token => {
    let value = token.endsWith("durl") ? direct : file.raw_url || direct
    for (const operation of [...token.replace(/(?:durl|url)$/, "")].reverse()) {
      if (operation === "e") value = encodeURIComponent(value)
      if (operation === "b") value = btoa(value)
    }
    return value
  })
  const parsed = new URL(url)
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("不支持的预览地址")
  return parsed.href
}

export function initialVideoQuality<T extends {id:string}>(qualities:T[], preferred?:string):T|undefined {
  return qualities.find(item=>item.id===preferred)
    || qualities.filter(item=>/^\d+$/.test(item.id)).sort((a,b)=>Number(a.id)-Number(b.id))[0]
    || qualities.find(item=>item.id==='auto') || qualities[0]
}
