import { DRIVE_ORIGIN, drivePreviewKind } from "./openlistShared"
import { encryptedIcon } from "../../util/encryptedIcon"
import { fileIcon, node } from "./driveUi"

export type DriveImageEntry = { displayName?: string; name: string; target: string; directory: boolean; shared?: boolean; portal?: boolean; protectedShare?: boolean; thumb?: string }
export function driveThumbnailUrl(value?: string): string | undefined {
  if (!value) return
  try { const url = new URL(value, DRIVE_ORIGIN); if (["https:", "http:"].includes(url.protocol)) return url.href } catch {}
}
export const isDriveImageEntry = (entry: DriveImageEntry) => !entry.directory && !entry.shared && drivePreviewKind(entry.name) === "image"

export function renderDriveImages(root: HTMLElement, entries: DriveImageEntry[], options: {
  append?: boolean; signal: AbortSignal; hasImages: boolean; directUrl: (entry: DriveImageEntry) => Promise<string>
}) {
  if (!options.append) root.replaceChildren()
  root.querySelector(".drive-image-empty")?.remove()
  const folders = root.querySelector<HTMLElement>(".drive-image-folders") || node("div", "", "drive-image-folders")
  const images = root.querySelector<HTMLElement>(".drive-image-grid") || node("div", "", "drive-image-grid")
  const filename = (entry: DriveImageEntry) => {
    const link = node("a", entry.displayName || entry.name, "internal drive-file-open"); link.href = entry.target; link.title = entry.name; link.dataset.noPopover = "true"; link.dataset.driveHover = "true"; return link
  }
  const card = (entry: DriveImageEntry, className: string) => {
    const item = node("div", "", className); item.dataset.driveEntry = entry.target
    if (!entry.portal) {
      const checkbox = node("input"); checkbox.type = "checkbox"; checkbox.dataset.entry = entry.target
      checkbox.setAttribute("aria-label", `选择 ${entry.name}`);item.append(checkbox)
    }
    return item
  }
  for (const entry of entries) {
    if (entry.directory || entry.shared) {
      const item = card(entry, "drive-image-folder"), name = node("div", "", "drive-entry-name")
      if (entry.protectedShare) { const mark = node("span", "", "encrypted-mark"); mark.innerHTML = encryptedIcon; mark.setAttribute("role", "img"); mark.setAttribute("aria-label", "需要提取码"); name.append(mark) }
      name.append(filename(entry)); item.append(fileIcon(entry.portal ? "space" : entry.shared ? "share" : "folder"), name); folders.append(item)
    } else if (isDriveImageEntry(entry)) {
      const item = card(entry, "drive-image-card"), link = node("a", "", "internal drive-image-thumbnail")
      link.href = entry.target; link.dataset.noPopover = "true"; link.dataset.driveHover = "true"; link.setAttribute("aria-label", `预览 ${entry.name}`)
      const image = node("img"), fallback = fileIcon("image"); image.alt = entry.name; image.loading = "lazy"; image.decoding = "async"; image.referrerPolicy = "no-referrer"
      const loading = node("span", "", "drive-loading drive-thumbnail-loading")
      loading.setAttribute("role", "status"); loading.setAttribute("aria-label", `正在加载 ${entry.name}`); loading.append(node("i"))
      link.classList.add("is-loading"); link.setAttribute("aria-busy", "true")
      image.width = 240; image.height = 180; fallback.hidden = true; link.append(image, fallback, loading)
      const finish = (failed = false) => {
        link.classList.remove("is-loading"); link.setAttribute("aria-busy", "false"); loading.remove()
        image.hidden = failed; fallback.hidden = !failed
      }
      image.addEventListener("load", () => finish(), { signal: options.signal })
      let direct = false
      const loadDirect = async () => {
        if (options.signal.aborted || !image.isConnected) return
        direct = true
        try {
          const url = await options.directUrl(entry)
          if (!options.signal.aborted && image.isConnected) image.src = url
        } catch { if (!options.signal.aborted) { finish(true) } }
      }
      image.addEventListener("error", () => {
        if (options.signal.aborted || !image.isConnected) return
        if (!direct) void loadDirect()
        else { finish(true) }
      }, { signal: options.signal })
      item.append(link, filename(entry)); images.append(item)
      const thumb = driveThumbnailUrl(entry.thumb)
      // Assign sources once the complete gallery is attached below.
      queueMicrotask(() => { if (!options.signal.aborted && image.isConnected) { if (thumb) image.src = thumb; else void loadDirect() } })
    }
  }
  if (folders.childElementCount && !folders.isConnected) root.prepend(folders)
  if (images.childElementCount) { if (!images.isConnected) root.append(images) }
  else if (!options.hasImages) root.append(node("p", "本目录无图片", "drive-image-empty"))
  if (!options.append) options.signal.addEventListener("abort", () => { for (const image of root.querySelectorAll("img")) image.removeAttribute("src") }, { once: true })
}
