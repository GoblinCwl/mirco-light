import { setupDockedButton } from "./dockedButton"
import { node } from "./driveUi"
export type DriveEpisode = { name: string; title: string; number?: number; href: string; current: boolean }

export function setupDriveEpisodes(root: HTMLElement, signal: AbortSignal) {
  const section = root.querySelector<HTMLElement>("[data-drive-episodes]")!
  const list = section.querySelector<HTMLElement>("[data-drive-episode-list]")!
  const heading = section.querySelector<HTMLElement>("[data-drive-episode-heading]")!
  const dialog = root.querySelector<HTMLDialogElement>("[data-drive-operations-dialog]")!
  const launch = root.querySelector<HTMLButtonElement>("[data-drive-operations-launch]")!
  const launchIcon = launch.querySelector("svg")!
  const operationIcon = launchIcon.innerHTML
  const compact = matchMedia("(max-width: 1199px)")
  const original = section.parentElement!, sibling = section.nextSibling
  const inline = document.querySelector<HTMLElement>("[data-drive-inline-episodes]")
  const placeSection = () => {
    if (compact.matches && enabled && inline) { if (section.parentElement !== inline) inline.append(section); launch.hidden = true }
    else if (section.parentElement !== original) original.insertBefore(section, sibling?.parentNode === original ? sibling : null)
  }
  let headingProgram = section.dataset.driveEpisodeProgram || "", headingSeason = section.dataset.driveEpisodeSeason || ""
  const updateHeading = () => {
    const title = [headingProgram, headingSeason !== headingProgram ? headingSeason : ""].filter(Boolean).join(" · ")
    heading.textContent = "选集"
    heading.title = title || "选集"
  }
  let enabled = section.hasAttribute("data-drive-episodes-retained") && !section.hidden, fingerprint = list.dataset.driveEpisodeFingerprint || ""
  if (enabled) list.scrollTop = Number(list.dataset.driveEpisodeScroll) || 0
  delete list.dataset.driveEpisodeScroll
  const { place, restore } = setupDockedButton(launch, compact, signal, () => "quartz-operation-launch-position:v1")
  list.addEventListener("click", event => { if ((event.target as Element).closest("a") && compact.matches && dialog.open) dialog.close() }, { signal })
  let layoutFrame = 0, locatedEpisode = "", locatedHeight = 0, locatedContentHeight = 0
  const layout = () => {
    cancelAnimationFrame(layoutFrame)
    layoutFrame = requestAnimationFrame(() => {
      if (signal.aborted) return
      placeSection(); place()
      if (!enabled || section.hidden) { list.style.removeProperty("--drive-episode-max-height"); return }
      if (compact.matches) list.style.removeProperty("--drive-episode-max-height")
      const inner = root.querySelector<HTMLElement>(".drive-operations-inner")!, sidebar = root.closest<HTMLElement>(".sidebar")
      const padding = (element: HTMLElement) => parseFloat(getComputedStyle(element).paddingBottom) || 0
      const bottom = Math.max(16, sidebar ? padding(sidebar) : 16) + padding(section) + padding(inner)
      const available = Math.max(0, Math.floor(innerHeight - list.getBoundingClientRect().top - bottom))
      const value = `${available}px`
      if (!compact.matches && list.style.getPropertyValue("--drive-episode-max-height") !== value) list.style.setProperty("--drive-episode-max-height", value)
      const current = list.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
      if (current && (current.href !== locatedEpisode || list.clientHeight !== locatedHeight || list.scrollHeight !== locatedContentHeight) && list.clientHeight > 0) {
        const scroller = list
        const box = scroller.getBoundingClientRect(), item = current.getBoundingClientRect()
        const last = list.querySelector<HTMLAnchorElement>('a:last-child')
        const lastRow = last && Math.abs(last.getBoundingClientRect().top - item.top) < 1
        if (lastRow) scroller.scrollTop = scroller.scrollHeight - scroller.clientHeight
        else if (item.top < box.top || item.bottom > box.bottom) scroller.scrollTop += item.top - box.top - (scroller.clientHeight - item.height) / 2
        locatedEpisode = current.href; locatedHeight = list.clientHeight; locatedContentHeight = list.scrollHeight
      }
    })
  }
  const resize = new ResizeObserver(layout)
  resize.observe(root); resize.observe(heading); resize.observe(launch); resize.observe(list)
  launch.addEventListener("click", () => { locatedEpisode = ""; layout() }, { signal })
  const poster = root.querySelector<HTMLElement>("[data-drive-media-poster]")
  if (poster) resize.observe(poster)
  const collections = root.querySelector<HTMLElement>("[data-drive-collections]")
  if (collections) resize.observe(collections)
  addEventListener("scroll", layout, { passive: true, signal })
  signal.addEventListener("abort", () => { cancelAnimationFrame(layoutFrame); resize.disconnect() }, { once: true })
  addEventListener("resize", layout, { signal })
  compact.addEventListener("change", () => { placeSection(); updateHeading(); layout() }, { signal })
  return (active: boolean, episodes: DriveEpisode[] = [], season?: number, programTitle?: string, seasonTitle?: string, pending = false) => {
    if (enabled && (pending || active && !episodes.length)) { layout(); return }
    delete section.dataset.driveEpisodesRetained
    const modeChanged = enabled !== active
    if (modeChanged) {
      launchIcon.innerHTML = active ? '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1" />' : operationIcon
    }
    enabled = active
    if (modeChanged) restore()
    root.classList.toggle("has-episode-picker", active)
    section.hidden = !active
    placeSection()
    root.querySelector<HTMLElement>("[data-drive-operations-launch-label]")!.textContent = active ? "选集" : "操作"
    headingProgram = programTitle || ""
    headingSeason = seasonTitle || (season == null ? "" : `第 ${season} 季`)
    section.dataset.driveEpisodeProgram = headingProgram
    section.dataset.driveEpisodeSeason = headingSeason
    updateHeading()
    const key = JSON.stringify(episodes.map(({ current, ...episode }) => episode))
    if (key !== fingerprint) {
      fingerprint = key; list.dataset.driveEpisodeFingerprint = key; list.replaceChildren()
      for (const episode of episodes) {
        const link = node("a", "", "internal drive-episode-link"); link.href = episode.href; link.dataset.noPopover = "true"
        link.title = `${episode.number == null ? "" : `第 ${episode.number} 集 · `}${episode.title}`
        link.setAttribute("aria-label", link.title)
        link.append(node("span", episode.number == null ? String(episodes.indexOf(episode) + 1) : String(episode.number), "drive-episode-number"))
        if (episode.current) link.setAttribute("aria-current", "page")
        list.append(link)
      }
    }
    const current = episodes.find(episode => episode.current)
    for (const link of list.querySelectorAll<HTMLAnchorElement>("a")) {
      if (current && link.href === new URL(current.href, location.origin).href) link.setAttribute("aria-current", "page")
      else link.removeAttribute("aria-current")
    }
    list.setAttribute("aria-busy", String(active && !episodes.length))
    // Restore after the launch button's visibility has been updated.
    layout()
  }
}
