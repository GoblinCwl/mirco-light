import { settingIcon } from "./icons"
import { mountTimeline } from "./timeline"
import { mountTrackMarquee } from "./trackMarquee"
import { openSubtitleAppearanceDialog } from "../subtitleAppearanceDialog"
import type { PlaybackController } from "./controller"
import type { PlayerBridge } from "./bridge"
import type { PlayerConfig, SubtitleTrack } from "./types"

const text = (value: string) => {
  const span = document.createElement("span")
  span.textContent = value
  return span.innerHTML
}
/** ArtPlayer check() also navigates to the selected item's parent panel.
 * Background subtitle initialization should update the checkmark, not close
 * the submenu the user is currently operating. */
export function checkSettingSilently(player: any, item: any) {
  if (!item) return
  const active = player.setting.show ? player.setting.active : undefined
  player.setting.check(item)
  if (active && player.setting.show && player.setting.active !== active)
    player.setting.render(active)
}
/** Selection reflects intent immediately, independently of subtitle I/O. */
export function syncSubtitleSetting(player: any, track?: SubtitleTrack) {
  const option = player.setting.find("subtitles")
  const item = option?.selector.find((entry: any) => entry.track === track)
  if (!item) return
  option.tooltip = item.html
  checkSettingSilently(player, item)
}
export function mountControls(
  player: any,
  controller: PlaybackController,
  config: PlayerConfig,
  bridge: PlayerBridge,
  selectSource: (type: string, fields: Record<string, unknown>, label: string) => Promise<void>,
  selectSubtitle: (track?: SubtitleTrack) => Promise<void>,
  currentSubtitle: () => SubtitleTrack | undefined,
  notice: (message: string) => void,
) {
  const lifetime = new AbortController()
  const trackRow = (row: HTMLElement) => row.classList.add("quartz-track-item")
  const persist = (patch: Record<string, unknown>) => bridge.send("videoPreference", { patch })
  const video = controller.video,
    element = player.template.$player as HTMLElement
  const togglePlayback = () => {
    if (controller.playing) controller.pause()
    else void controller.play().catch((error) => notice(error.message))
  }
  element.addEventListener(
    "click",
    (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".art-control-playAndPause,.art-state")
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      togglePlayback()
    },
    { capture: true, signal: lifetime.signal },
  )
  for (const handler of [...(player.hotkey.keys.Space || [])])
    player.hotkey.remove("Space", handler)
  player.hotkey.add("Space", togglePlayback)
  // ArtPlayer checks an option before invoking onSelect. Restore the confirmed
  // choice while the request runs; a failed switch must not lie about quality.
  const select = async (name: string, item: any, previous: any, work: () => Promise<void>) => {
    const option = player.setting.find(name)
    const restore = () => {
      if (previous) player.setting.check(previous)
    }
    restore()
    if (controller.busy) {
      notice("正在加载视频，请稍候")
      return previous?.html || option.tooltip
    }
    player.setting.show = false
    try {
      await work()
      player.setting.check(item)
      return item.html
    } catch (error) {
      restore()
      notice((error as Error).message)
      return previous?.html || option.tooltip
    }
  }
  player.setting.add({
    name: "jellyfinQuality",
    html: "画质",
    icon: settingIcon("jellyfinQuality"),
    tooltip:
      config.jellyfin.qualities.find((q) => q.id === config.jellyfin.quality)?.name || "自动",
    selector: config.jellyfin.qualities.map((q) => ({
      html: q.name,
      quality: q.id,
      default: q.id === config.jellyfin.quality,
    })),
    onSelect: (item: any) => {
      return select(
        "jellyfinQuality",
        item,
        player.setting
          .find("jellyfinQuality")
          .selector.find((entry: any) => entry.quality === config.jellyfin.quality),
        async () => {
          await selectSource("jellyfinQuality", { quality: item.quality }, "画质")
          config.jellyfin.quality = item.quality
        },
      )
    },
  })
  if (config.jellyfin.audioTracks.length > 1)
    player.setting.add({
      name: "jellyfinAudio",
      html: "音轨",
      mounted: trackRow,
      icon: settingIcon("jellyfinAudio"),
      tooltip: text(
        config.jellyfin.audioTracks.find((t) => t.index === config.jellyfin.audioStreamIndex)
          ?.name || "",
      ),
      selector: config.jellyfin.audioTracks.map((t) => ({
        html: text(t.name),
        mounted: trackRow,
        audioStreamIndex: t.index,
        default: t.index === config.jellyfin.audioStreamIndex,
      })),
      onSelect: (item: any) => {
        return select(
          "jellyfinAudio",
          item,
          player.setting
            .find("jellyfinAudio")
            .selector.find(
              (entry: any) => entry.audioStreamIndex === config.jellyfin.audioStreamIndex,
            ),
          async () => {
            await selectSource("jellyfinAudio", { audioStreamIndex: item.audioStreamIndex }, "音轨")
            config.jellyfin.audioStreamIndex = item.audioStreamIndex
          },
        )
      },
    })
  const startingSubtitle = currentSubtitle()
  if (config.nativeSubtitles?.length)
    player.setting.add({
      name: "subtitles",
      html: "字幕",
      mounted: trackRow,
      icon: settingIcon("subtitles"),
      tooltip: startingSubtitle ? text(startingSubtitle.name) : "关闭",
      selector: [
        { html: "关闭", track: undefined, default: !startingSubtitle },
        ...config.nativeSubtitles.map((track) => ({
          html: text(track.name),
          default: track === startingSubtitle,
          track,
          mounted: trackRow,
        })),
      ],
      onSelect: (item: any) => {
        return select(
          "subtitles",
          item,
          player.setting
            .find("subtitles")
            .selector.find((entry: any) => entry.track === currentSubtitle()),
          () => selectSubtitle(item.track),
        )
      },
    })

  const sliders = new Map<string, { input: HTMLInputElement; output: HTMLOutputElement }>()
  const resetSlider = (name: string, value: number) => {
    const row = sliders.get(name)
    if (row) {
      row.input.value = String(value)
      row.output.textContent = String(value)
    }
  }
  const resetItem = (name: string, action: () => void) => ({
    name,
    html: "恢复默认",
    mounted: (row: HTMLElement) =>
      row.addEventListener(
        "click",
        (event) => {
          event.stopImmediatePropagation()
          action()
        },
        { capture: true },
      ),
  })
  const slider = (
    name: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    change: (value: number) => void,
  ) => ({
    name,
    html: label,
    mounted: (row: HTMLElement) => {
      row.classList.add("quartz-subtitle-style-row")
      const input = document.createElement("input"),
        output = document.createElement("output")
      input.type = "range"
      input.min = String(min)
      input.max = String(max)
      input.step = String(step)
      input.value = String(value)
      input.setAttribute("aria-label", label)
      output.textContent = String(value)
      const caption = document.createElement("label")
      caption.textContent = label
      caption.append(input)
      row.replaceChildren(caption, output)
      sliders.set(name, { input, output })
      input.oninput = () => {
        const v = Number(input.value)
        output.textContent = String(v)
        change(v)
      }
      row.addEventListener("click", (event) => event.stopImmediatePropagation(), true)
      row.addEventListener("keydown", (event) => event.stopPropagation())
    },
  })
  let subtitlesEditable = false
  let appearanceEditable = false
  const appearanceRows: HTMLElement[] = []
  const subtitleRows: HTMLElement[] = []
  const subtitleMounted = (row: HTMLElement) => {
    subtitleRows.splice(0, subtitleRows.length, ...subtitleRows.filter((row) => row.isConnected))
    subtitleRows.push(row)
    row.style.display = subtitlesEditable ? "" : "none"
  }
  if (config.nativeSubtitles?.some((t) => t.type !== "pgs")) {
    player.setting.add({
      name: "subtitleDelay",
      html: "字幕偏移",
      mounted: subtitleMounted,
      icon: settingIcon("subtitleDelay"),
      tooltip: `${config.preferences?.subtitleDelay || 0} 秒`,
      selector: [
        slider(
          "subtitleDelay-value",
          "偏移（秒）",
          -60,
          60,
          0.1,
          config.preferences?.subtitleDelay || 0,
          (value) => {
            persist({ subtitleDelay: value })
            window.dispatchEvent(new CustomEvent("quartz-subtitle-delay", { detail: value }))
            player.setting.find("subtitleDelay").tooltip = `${value} 秒`
          },
        ),
        resetItem("subtitleDelay-reset", () => {
          resetSlider("subtitleDelay-value", 0)
          persist({ subtitleDelay: 0 })
          window.dispatchEvent(new CustomEvent("quartz-subtitle-delay", { detail: 0 }))
          player.setting.find("subtitleDelay").tooltip = "0 秒"
        }),
      ],
    })
  }
  player.setting.add({
    name: "subtitleStyle",
    html: "字幕外观",
    icon: settingIcon("subtitleStyle"),
    mounted: (row: HTMLElement) => {
      appearanceRows.splice(
        0,
        appearanceRows.length,
        ...appearanceRows.filter((item) => item.isConnected),
      )
      appearanceRows.push(row)
      row.style.display = appearanceEditable ? "" : "none"
      const left = row.querySelector(".art-setting-item-left")
      let icon = row.querySelector<HTMLElement>(".art-setting-item-left-icon")
      if (!icon) {
        icon = document.createElement("span")
        icon.className = "art-setting-item-left-icon"
        left?.prepend(icon)
      }
      icon.innerHTML = settingIcon("subtitleStyle")
      row.addEventListener(
        "click",
        (event) => {
          event.stopImmediatePropagation()
          player.setting.show = false
          if (document.fullscreenElement) {
            openSubtitleAppearanceDialog(
              config.preferences?.subtitleAppearance,
              (value) => {
                persist({ subtitleAppearance: value })
                window.dispatchEvent(
                  new CustomEvent("quartz-subtitle-appearance", { detail: value }),
                )
              },
              lifetime.signal,
              element,
            )
          } else bridge.send("subtitleAppearanceOpen")
        },
        { capture: true },
      )
    },
  })

  const subtitleSelection = (event: Event) => {
    const detail = (event as CustomEvent<{ editable: boolean; appearance: boolean }>).detail
    subtitlesEditable = detail.editable
    appearanceEditable = detail.appearance
    for (const row of subtitleRows) row.style.display = subtitlesEditable ? "" : "none"
    for (const row of appearanceRows) row.style.display = appearanceEditable ? "" : "none"
  }

  window.addEventListener("quartz-subtitle-selection", subtitleSelection)
  let volume = Math.max(0, Math.min(2, config.preferences?.volume ?? 0.7)),
    context: AudioContext | undefined,
    gain: GainNode | undefined
  const renderVolume = () => {
    const percent = Math.round((video.muted ? 0 : volume) * 100)
    const input = element.querySelector<HTMLInputElement>(".quartz-volume-slider")
    const label = element.querySelector<HTMLElement>(".quartz-volume-value")
    if (input) input.value = String(percent)
    if (label) label.textContent = `${percent}%`
  }
  const setVolume = (value: number, unmute = true) => {
    volume = Math.max(0, Math.min(2, value))
    if (volume > 1 && !context)
      try {
        const Audio = (window as any).AudioContext || (window as any).webkitAudioContext
        context = new Audio()
        gain = context!.createGain()
        context!.createMediaElementSource(video).connect(gain)
        gain.connect(context!.destination)
      } catch {
        volume = 1
        notice("当前浏览器不支持音量增强")
      }
    if (context?.state === "suspended") void context.resume().catch(() => {})
    if (gain && context) gain.gain.setValueAtTime(Math.max(1, volume), context.currentTime)
    video.volume = Math.min(1, volume)
    if (unmute) video.muted = volume === 0
    persist({ volume, muted: video.muted })
    renderVolume()
    notice(`音量 ${Math.round((video.muted ? 0 : volume) * 100)}%`)
  }

  const nativePanel = element.querySelector(".art-volume-inner")
  if (nativePanel) {
    const label = document.createElement("span")
    label.className = "quartz-volume-value"
    const input = document.createElement("input")
    input.className = "quartz-volume-slider"
    input.type = "range"
    input.min = "0"
    input.max = "200"
    input.value = String(volume * 100)
    input.setAttribute("aria-label", "音量")
    input.oninput = () => setVolume(Number(input.value) / 100)
    nativePanel.replaceChildren(label, input)
  }
  renderVolume()
  for (const [key, delta] of [
    ["ArrowUp", 0.1],
    ["ArrowDown", -0.1],
  ] as const) {
    for (const handler of [...(player.hotkey.keys[key] || [])]) player.hotkey.remove(key, handler)
    player.hotkey.add(key, () => setVolume(volume + delta))
  }
  player.on("video:volumechange", () => {
    if (video.volume < 1) {
      volume = video.volume
      if (gain && context) gain.gain.setValueAtTime(1, context.currentTime)
    }
    persist({ volume, muted: video.muted })
    renderVolume()
  })
  video.addEventListener(
    "play",
    () => {
      if (volume > 1 && !context) setVolume(volume, false)
    },
    { signal: lifetime.signal },
  )
  element.addEventListener(
    "wheel",
    (event) => {
      if (
        event.ctrlKey ||
        !event.deltaY ||
        (event.target instanceof Element &&
          event.target.closest(
            ".art-settings,.apd-config-panel,.art-selector-list,.art-contextmenus,.art-volume-panel,input,textarea,select",
          ))
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      setVolume(volume + (event.deltaY < 0 ? 0.1 : -0.1))
    },
    { passive: false, capture: true, signal: lifetime.signal },
  )
  player.on("video:ratechange", () => {
    if (video.defaultPlaybackRate !== video.playbackRate)
      video.defaultPlaybackRate = video.playbackRate
    persist({ playbackRate: video.playbackRate })
  })
  player.on("aspectRatio", (ratio: string) => persist({ aspectRatio: ratio }))

  mountTimeline(player, video, config.timeline, lifetime.signal)
  let skip = config.preferences?.skipIntroOutro === true
  if (config.timeline?.segments.some((s) => ["Intro", "Outro"].includes(s.type)))
    player.setting.add({
      name: "skipIntroOutro",
      html: "跳过片头片尾",
      icon: settingIcon("skipIntroOutro"),
      switch: skip,
      onSwitch: (item: any) => {
        skip = !item.switch
        persist({ skipIntroOutro: skip })
        return skip
      },
    })
  const skipAtTime = () => {
    if (!skip || controller.busy || video.paused) return
    const segment = config.timeline?.segments.find(
      (s) =>
        ["Intro", "Outro"].includes(s.type) &&
        video.currentTime >= s.start &&
        video.currentTime < s.end - 0.25,
    )
    if (segment) controller.seek(segment.end)
  }
  video.addEventListener("timeupdate", skipAtTime)
  if (config.episodes) {
    for (const [direction, label, path] of [
      ["previous", "上一集", "M5 5h2v14H5zm3 7 11-7v14z"],
      ["next", "下一集", "M17 5h2v14h-2zM5 5l11 7-11 7z"],
    ] as const) {
      const target = config.episodes[direction]
      const activate = () => {
        if (target) bridge.send("videoEpisode", { direction })
      }
      player.controls.add({
        name: direction,
        position: "left",
        index: direction === "previous" ? 5 : 15,
        html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`,
        style: {
          width: "28px",
          minWidth: "28px",
          padding: "0",
          opacity: target ? "1" : ".3",
          cursor: target ? "pointer" : "default",
        },
        tooltip: label,
        mounted: (control: HTMLElement) => {
          control.setAttribute("role", "button")
          control.setAttribute("aria-label", label)
          control.setAttribute("aria-disabled", String(!target))
          control.tabIndex = target ? 0 : -1
          control.title = target ? `${label}：${target.name}` : `没有${label}`
          control.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              activate()
            }
          })
        },
        click: activate,
      })
    }
  }

  const heading = document.createElement("div")
  heading.className = "quartz-settings-heading"
  const caption = document.createElement("span")
  caption.textContent = "播放设置"
  const close = document.createElement("button")
  close.type = "button"
  close.innerHTML = settingIcon("close")
  close.setAttribute("aria-label", "关闭播放设置")
  close.onclick = () => {
    player.setting.show = false
  }
  heading.append(caption, close)
  element.querySelector(".art-settings")?.prepend(heading)
  mountTrackMarquee(player, element, lifetime.signal)
  let danmaku: HTMLElement | null = null,
    panel: HTMLElement | null = null,
    toggle: HTMLElement | null = null
  let pendingDanmakuMenu: (() => void) | undefined
  const placePanel = () => {
    if (!panel) return
    const bounds = element.getBoundingClientRect(),
      anchor = danmaku!.getBoundingClientRect(),
      compact = bounds.width < 600,
      width = Math.min(320, bounds.width - 16),
      bottom = compact ? 8 : 60
    panel.style.width = `${width}px`
    element.style.setProperty(
      "--quartz-danmuku-left",
      `${bounds.right - 8 - width - anchor.left}px`,
    )
    element.style.setProperty(
      "--quartz-danmuku-bottom",
      `${anchor.bottom - bounds.bottom + bottom}px`,
    )
    element.style.setProperty("--quartz-danmuku-height", `${bounds.height - bottom - 8}px`)
  }
  const closeDanmaku = () => {
    danmaku?.classList.remove("quartz-danmuku-open")
    toggle?.setAttribute("aria-expanded", "false")
  }
  player.on("setting", (open: boolean) => {
    if (open) closeDanmaku()
    else if (pendingDanmakuMenu) {
      const install = pendingDanmakuMenu
      pendingDanmakuMenu = undefined
      if (!lifetime.signal.aborted) install()
    }
  })
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof Node && !danmaku?.contains(event.target)) closeDanmaku()
    },
    { signal: lifetime.signal },
  )
  const danmakuReady = () => {
    danmaku = element.querySelector(".apd-config")
    panel = danmaku?.querySelector(".apd-config-panel") || null
    toggle = danmaku?.querySelector(".apd-config-icon") || null
    if (toggle && !toggle.parentElement?.classList.contains("quartz-danmuku-settings-trigger")) {
      const trigger = document.createElement("span")
      trigger.className = "quartz-danmuku-settings-trigger hint--top hint--rounded"
      trigger.setAttribute("aria-label", "弹幕设置")
      toggle.before(trigger)
      trigger.append(toggle)
    }
    const inner = panel?.querySelector(".apd-config-panel-inner")
    if (inner) {
      const heading = document.createElement("div")
      heading.className = "quartz-danmuku-heading"
      const label = document.createElement("span")
      label.textContent = "弹幕设置"
      const close = document.createElement("button")
      close.type = "button"
      close.innerHTML = settingIcon("close")
      close.setAttribute("aria-label", "关闭弹幕设置")
      close.onclick = closeDanmaku
      heading.append(label, close)
      inner.prepend(heading)
    }
    for (const [selector, name, off] of [
      [".apd-toggle-on", "quartzCompactDanmuku", false],
      [".apd-toggle-off", "quartzCompactDanmuku", true],
      [".apd-config-icon", "quartzCompactDanmukuSettings", false],
    ] as const) {
      const icon = element.querySelector<SVGElement>(selector)
      if (!icon) continue
      const source = document.createElement("span")
      source.innerHTML = settingIcon(name)
      icon.innerHTML =
        source.querySelector("svg")!.innerHTML + (off ? '<path d="m3 3 18 18"/>' : "")
      icon.setAttribute("viewBox", "0 0 24 24")
      icon.setAttribute("fill", "none")
      icon.setAttribute("stroke", "currentColor")
      icon.setAttribute("stroke-width", "1.7")
      icon.setAttribute("stroke-linecap", "round")
      icon.setAttribute("stroke-linejoin", "round")
      icon.classList.add("quartz-danmuku-icon")
    }
    toggle?.addEventListener(
      "click",
      (event) => {
        event.preventDefault()
        event.stopImmediatePropagation()
        player.setting.show = false
        placePanel()
        const active = danmaku?.classList.toggle("quartz-danmuku-open")
        toggle?.setAttribute("aria-expanded", String(active))
      },
      true,
    )
    const engine = player.plugins.artplayerPluginDanmuku
    const installMenu = () => {
      player.setting.add({
        name: "quartzCompactDanmuku",
        html: "显示弹幕",
        icon: settingIcon("quartzCompactDanmuku"),
        switch: !engine.isHide,
        onSwitch: () => {
          const show = engine.isHide
          show ? engine.show() : engine.hide()
          return show
        },
      })
      player.setting.add({
        name: "quartzCompactDanmukuSettings",
        html: "弹幕设置",
        icon: settingIcon("quartzCompactDanmukuSettings"),
        mounted: (row: HTMLElement) =>
          row.addEventListener(
            "click",
            (event) => {
              event.stopImmediatePropagation()
              player.setting.show = false
              placePanel()
              danmaku?.classList.add("quartz-danmuku-open")
            },
            { capture: true },
          ),
      })
      const sync = () =>
        player.setting.update({ name: "quartzCompactDanmuku", switch: !engine.isHide })
      player.on("artplayerPluginDanmuku:show", sync)
      player.on("artplayerPluginDanmuku:hide", sync)
    }
    // ArtPlayer rebuilds the complete settings tree on add(). A background
    // plugin becoming ready must not kick the user out of a quality submenu.
    if (player.setting.show) pendingDanmakuMenu = installMenu
    else installMenu()
    placePanel()
  }
  window.addEventListener("quartz-danmaku-ready", danmakuReady)
  const observer = new ResizeObserver(() => {
    element.classList.toggle("quartz-player-compact", element.clientWidth < 600)
    placePanel()
  })
  observer.observe(element)
  return () => {
    lifetime.abort()
    window.removeEventListener("quartz-danmaku-ready", danmakuReady)
    window.removeEventListener("quartz-subtitle-selection", subtitleSelection)
    observer.disconnect()
    video.removeEventListener("timeupdate", skipAtTime)
    void context?.close()
  }
}
