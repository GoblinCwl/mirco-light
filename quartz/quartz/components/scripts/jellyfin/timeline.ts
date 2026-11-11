import type { PlayerConfig } from "./types"

/** Existing Jellyfin segment/chapter presentation, independent of playback. */
export function mountTimeline(
  player: any,
  video: HTMLVideoElement,
  timeline: PlayerConfig["timeline"],
  signal: AbortSignal,
) {
  if (!timeline || !(timeline.segments.length || timeline.chapters.length)) return
  const progress = player.template.$player.querySelector(
    ".art-control-progress-inner",
  ) as HTMLElement
  const markers = document.createElement("div")
  markers.className = "quartz-timeline"
  markers.setAttribute("aria-hidden", "true")
  progress.append(markers)
  const duration = () =>
    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : timeline.duration
  const draw = () => {
    markers.replaceChildren()
    const total = duration()
    if (!(total > 0)) return
    for (const segment of timeline.segments) {
      const start = Math.max(0, segment.start),
        end = Math.min(total, segment.end)
      if (end <= start) continue
      const marker = document.createElement("span")
      marker.className = "quartz-timeline-segment"
      marker.dataset.type = segment.type
      marker.style.left = `${(start / total) * 100}%`
      marker.style.width = `${((end - start) / total) * 100}%`
      markers.append(marker)
    }
    for (const chapter of timeline.chapters) {
      if (chapter.time <= 0 || chapter.time >= total) continue
      const marker = document.createElement("span")
      marker.className = "quartz-timeline-chapter"
      marker.style.left = `${(chapter.time / total) * 100}%`
      markers.append(marker)
    }
  }
  draw()
  video.addEventListener("loadedmetadata", draw, { signal })
  video.addEventListener("durationchange", draw, { signal })
  player.on("setBar", (kind: string, fraction: number, event?: Event) => {
    if (kind !== "hover" && !(kind === "played" && event)) return
    const total = duration(),
      time = Math.max(0, Math.min(total, fraction * total))
    if (!Number.isFinite(time)) return
    const labels = timeline.segments
      .filter((segment) => time >= segment.start && time < segment.end)
      .map((segment) => segment.text)
    const chapter = [...timeline.chapters].reverse().find((chapter) => chapter.time <= time)
    if (chapter && !labels.includes(chapter.text)) labels.push(chapter.text)
    const tip = progress.querySelector<HTMLElement>(".art-progress-tip")
    if (!tip || !labels.length) return
    const seconds = Math.floor(time),
      hours = Math.floor(seconds / 3600)
    const stamp = `${hours ? `${hours}:` : ""}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    tip.textContent = `${stamp} · ${labels.join(" · ")}`
    const trackWidth = progress.clientWidth,
      width = tip.getBoundingClientRect().width
    tip.style.left = `${Math.max(0, Math.min(trackWidth - width, fraction * trackWidth - width / 2))}px`
  })
}
