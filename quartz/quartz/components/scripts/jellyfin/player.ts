import {mountPlayerPanels} from "../playerPanels"
import { mountPlayerFullscreen } from "../playerFullscreen"
import { createStatusStack } from "./statusStack"
import { playerIcons } from "./icons"
import { PlayerBridge } from "./bridge"
import { PlayerAssets } from "./assets"
import { PlaybackController } from "./controller"
import { BrowserTransport } from "./transport"
import { SubtitleManager } from "./subtitles"
import { DanmakuManager } from "./danmaku"
import { mountControls, syncSubtitleSetting } from "./controls"
import { playerStyles } from "../videoPlayerStyles"
import { initialJellyfinSubtitle } from "../jellyfinSubtitleSelection"
import type { PlayerConfig, PlaybackSource, SubtitleTrack } from "./types"

/** Jellyfin entry: ordinary previews do not execute this bundle. UI, media
 * lifecycle, subtitles and danmaku have explicit independent owners. */
export async function mountJellyfinPlayer(config: PlayerConfig) {
  const root = document.getElementById("preview")!,
    bridge = new PlayerBridge(config.channel),
    assets = new PlayerAssets(bridge),
    lifetime = new AbortController()
  document.documentElement.style.overflow = "hidden"
  document.body.style.margin = "0"
  document.body.style.padding = "0"
  root.style.width = "100%"
  root.style.position = "relative"
  root.style.height = `${Math.max(180, root.clientWidth / (config.videoAspectRatio || 16 / 9))}px`
  const theme = (name: string, colors: PlayerConfig["colors"]) => {
    document.documentElement.dataset.previewTheme = name
    document.documentElement.style.colorScheme = name
    for (const [key, value] of Object.entries(colors))
      document.documentElement.style.setProperty(`--${key}`, value)
  }
  theme(config.theme, config.colors)
  const style = document.createElement("style")
  style.textContent =
    playerStyles +
    `\n.libassjs-canvas-parent{position:absolute!important;inset:0;width:100%;height:100%;pointer-events:none}.quartz-playback-error{position:absolute;inset:15% 10% auto;z-index:60;background:var(--background);color:var(--foreground);padding:12px;border:1px solid var(--border);border-radius:8px;text-align:center}.quartz-playback-error button{margin-left:12px;background:transparent;color:var(--accent);border:1px solid var(--border);border-radius:4px;padding:4px 10px}`
  document.head.append(style)
  try {
    await Promise.all([assets.script("artplayer.js"), assets.script("hls.min.js")])
  } catch (error) {
    lifetime.abort()
    bridge.dispose()
    assets.dispose()
    throw error
  }
  // ArtPlayer installs its own stylesheet when the script evaluates. Keep the
  // existing site skin after it, as in the original player, in both themes.
  document.head.append(style)
  style.textContent += `
    .quartz-player[data-playback-intent="playing"] .art-control-playAndPause .art-icon-play,
    .quartz-player[data-playback-intent="paused"] .art-control-playAndPause .art-icon-pause{display:none!important}
    .quartz-player[data-playback-intent="playing"] .art-control-playAndPause .art-icon-pause,
    .quartz-player[data-playback-intent="paused"] .art-control-playAndPause .art-icon-play{display:inline-flex!important}
  `
  const global = window as any
  const player = new global.Artplayer({
    container: root,
    url: "",
    poster: config.cover || "",
    type: "",
    autoplay: false,
    moreVideoAttr: { crossOrigin: "anonymous", playsInline: true, preload: "auto" },
    theme: config.colors.accent,
    volume: Math.min(1, config.preferences?.volume ?? 0.7),
    muted: config.preferences?.muted ?? false,
    setting: true,
    playbackRate: true,
    aspectRatio: true,
    fullscreen: true,
    fullscreenWeb: true,
    screenshot: false,
    plugins: [],
    icons: playerIcons,
  })
  const element = player.template.$player as HTMLElement,
    video = player.template.$video as HTMLVideoElement
  element.classList.add("quartz-player")
  mountPlayerPanels(player,root,config.channel,lifetime.signal)
  const transport = new BrowserTransport(
      video,
      global.Hls,
      config.jellyfin.hlsMode,
      config.jellyfin.highBitrateBuffer,
    ),
    controller = new PlaybackController(video, transport)
  const rightStatus = createStatusStack(element, "right", lifetime.signal)
  const leftStatus = createStatusStack(element, "left", lifetime.signal)
  const legacyNotice = player.template.$notice || element.querySelector(".art-notice")
  if (legacyNotice) leftStatus.element.append(legacyNotice)
  const subtitleStatus = rightStatus.status(),
    danmakuStatus = rightStatus.status()
  const notice = (message: string) =>
    leftStatus.notice(message, /^音量\s/.test(message) ? "volume" : message)
  const danmakuNotice = (message: string) => rightStatus.notice(message, "danmaku-result")
  let latest: PlaybackSource | undefined, lastDecodeFallbackSeek: number | undefined
  let subtitles: SubtitleManager
  const persist = (patch: Record<string, unknown>) => bridge.send("videoPreference", { patch })
  const changeSource = async (type: string, fields: Record<string, unknown>, label: string) => {
    if (controller.busy) throw new Error("正在加载视频，请稍候")
    const previous = latest,
      position = controller.source ? controller.position : config.resumeTime || 0,
      playing = controller.playing
    let ticket: PlaybackSource | undefined
    const request = bridge.change(type, { ...fields, position }).then((source) => {
      ticket = source
      latest = source
      return source
    })
    try {
      await controller.load(request, position, playing, label)
      if (ticket) bridge.ack(ticket, true)
      subtitles?.sync()
      updateSubtitleControls()
    } catch (error) {
      if (ticket) bridge.ack(ticket, false)
      latest = previous
      subtitles?.sync()
      if ((error as any).decode && !fields.compatible && type !== "jellyfinFallback")
        return changeSource(type, { ...fields, compatible: true }, label)
      throw error
    }
  }
  subtitles = new SubtitleManager(video, config, assets, {
    status: subtitleStatus,
    selection: (track) => {
      syncSubtitleSetting(player, track)
      updateSubtitleControls()
    },
    notice: (message) => rightStatus.notice(message, "subtitle-result"),
    burned: () => latest?.subtitleStreamIndex ?? config.jellyfin.initialSubtitleIndex ?? -1,
    burn: async (index) => {
      await controller.whenIdle()
      await changeSource(
        "jellyfinSubtitle",
        { subtitleStreamIndex: index, forceBurn: index >= 0 },
        "字幕",
      )
    },
  })
  subtitles.selected = initialJellyfinSubtitle(
    config.nativeSubtitles || [],
    config.preferences?.subtitle,
    config.jellyfin.defaultSubtitleStreamIndex,
  )
  let subtitleAction = false
  const chooseSubtitle = async (track?: SubtitleTrack) => {
    if (subtitleAction) throw new Error("字幕正在切换，请稍候")
    subtitleAction = true
    updateLoading()
    const previousSubtitle = subtitles.selected
    const playing = controller.playing
    if (playing) controller.pause()
    const intentVersion = controller.intentVersion
    try {
      await subtitles.select(track)
      updateSubtitleControls()
      persist({ subtitle: track?.key || "off" })
    } catch (error) {
      try {
        await subtitles.select(previousSubtitle, false)
        updateSubtitleControls()
      } catch {
        rightStatus.notice("字幕未能恢复，请重新选择", "subtitle-result")
      }
      throw error
    } finally {
      subtitleAction = false
      updateLoading()
      if (
        playing &&
        controller.intentVersion === intentVersion &&
        controller.state.phase !== "error"
      )
        void controller.play().catch(error=>notice(error instanceof Error?error.message:"恢复播放失败"))
    }
  }
  const updateSubtitleControls = () =>
    window.dispatchEvent(
      new CustomEvent("quartz-subtitle-selection", {
        detail: { editable: subtitles.customizable, appearance: subtitles.appearanceEditable },
      }),
    )
  const disposeControls = mountControls(
    player,
    controller,
    config,
    bridge,
    changeSource,
    chooseSubtitle,
    () => subtitles.selected,
    notice,
  )
  updateSubtitleControls()
  let danmaku: DanmakuManager | undefined
  const loadDanmaku = async () => {
    if (!config.danmuApi) return
    try {
      await assets.script("artplayer-plugin-danmuku.js")
      if (lifetime.signal.aborted) return
      await player.plugins.add(
        global.artplayerPluginDanmuku({
          danmuku: [],
          emitter: false,
          opacity: 0.7,
          fontSize: matchMedia("(pointer:coarse)").matches ? 16 : 25,
          margin: [10, "50%"],
          ...(config.preferences?.danmuku || {}),
        }),
      )
      danmaku = new DanmakuManager(player, config, bridge, danmakuStatus, danmakuNotice)
      danmaku.mount()
      window.dispatchEvent(new Event("quartz-danmaku-ready"))
      void danmaku.load()
    } catch {
      if (!lifetime.signal.aborted) danmakuNotice("弹幕组件加载失败，视频可继续播放")
    }
  }
  const error = document.createElement("div")
  error.className = "quartz-playback-error"
  error.setAttribute("role", "alert")
  error.hidden = true
  element.append(error)
  const retry = () => {
    lastDecodeFallbackSeek = undefined
    error.hidden = true
    void changeSource("jellyfinRetry", {}, "重新播放")
      .then(() => {
        initializeSubtitles()
        return controller.play()
      })
      .catch((e) => notice(e.message))
  }
  let wasBusy = true
  const updateLoading = () => {
    element.dataset.playbackIntent = controller.playing ? "playing" : "paused"
    element
      .querySelector(".art-control-playAndPause")
      ?.setAttribute("aria-label", controller.playing ? "暂停播放" : "播放")
    const busy =
      subtitleAction ||
      ["idle", "loading", "switching", "buffering", "seeking"].includes(controller.state.phase)
    const becameReady = wasBusy && !busy
    wasBusy = busy
    if (player.loading.show !== busy) player.loading.show = busy
    const paused = !busy && controller.state.phase === "paused"
    if (player.mask.show !== paused) player.mask.show = paused
    if (becameReady) player.controls.show = true
  }
  controller.subscribe((state) => {
    element.dataset.playbackState = state.phase
    updateLoading()
    subtitles.setVisible(!["loading", "switching", "error"].includes(state.phase))
    if (state.phase === "error") {
      error.replaceChildren(document.createTextNode(state.error || "播放失败"))
      const button = document.createElement("button")
      button.type = "button"
      button.textContent = "重试"
      button.onclick = retry
      error.append(button)
      if (error.hidden) bridge.send("jellyfinPlaybackErrorShown")
      error.hidden = false
    } else error.hidden = true
  })
  player.on("loading", updateLoading)
  player.on("mask", updateLoading)
  bridge.onError = (message) => {
    void controller.fail(new Error(message))
  }
  controller.onDecodeError = async () => {
    if (lastDecodeFallbackSeek === controller.seekVersion) return false
    lastDecodeFallbackSeek = controller.seekVersion
    try {
      await changeSource("jellyfinFallback", { position: controller.position }, "兼容播放")
      notice("已由 Jellyfin 重新协商播放")
      return true
    } catch {
      return false
    }
  }
  let lastSave = 0
  const saveProgress = (force = false) => {
    if (
      controller.busy ||
      !controller.source ||
      controller.state.phase === "error" ||
      video.seeking ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    )
      return
    if (!force && Date.now() - lastSave < 5000) return
    lastSave = Date.now()
    bridge.send("videoProgress", {
      position: controller.position,
      duration: video.duration,
      ended: video.ended,
    })
  }
  video.addEventListener("timeupdate", () => saveProgress(), { signal: lifetime.signal })
  video.addEventListener("pause", () => saveProgress(true), { signal: lifetime.signal })
  video.addEventListener("ended", () => saveProgress(true), { signal: lifetime.signal })
  if (config.preferences?.playbackRate) player.playbackRate = config.preferences.playbackRate
  if (config.preferences?.aspectRatio) player.aspectRatio = config.preferences.aspectRatio
  const native = (event?: Event) => {
    const mode = (video as any).webkitPresentationMode
    subtitles.setNative(
      event?.type==="webkitendfullscreen"
        ? mode==="picture-in-picture" || document.pictureInPictureElement===video
        : event?.type==="leavepictureinpicture" ? false
        : event?.type==="webkitbeginfullscreen" || mode === "fullscreen" ||
          mode === "picture-in-picture" || !!(video as any).webkitDisplayingFullscreen || document.pictureInPictureElement === video,
    )
  }
  for (const event of [
    "webkitbeginfullscreen",
    "webkitendfullscreen",
    "webkitpresentationmodechanged",
    "enterpictureinpicture",
    "leavepictureinpicture",
  ])
    video.addEventListener(event, native, { signal: lifetime.signal })
  player.on("fullscreenWeb", () => {
    scheduleResize()
  })
  let resizeFrame: number | undefined, lastContentHeight: number | undefined
  const resize = () => {
    if (player.fullscreen || player.fullscreenWeb) {
      root.style.height = "100vh"
    } else {
      const ratio =
        video.videoWidth && video.videoHeight
          ? video.videoWidth / video.videoHeight
          : config.videoAspectRatio || 16 / 9
      const height = Math.max(180, root.clientWidth / ratio)
      if (root.style.height !== `${height}px`) root.style.height = `${height}px`
      const reportedHeight = Math.ceil(height)
      if (lastContentHeight !== reportedHeight) {
        lastContentHeight = reportedHeight
        bridge.send("contentHeight", { height: reportedHeight })
      }
    }
    root.style.setProperty("--quartz-state-size", `${Math.max(28, Math.min(68, Math.min(root.clientWidth, root.clientHeight) * .12))}px`)
    subtitles.resize()
    subtitles.sync()
  }
  // Observed geometry must not be changed in the ResizeObserver delivery
  // itself: fullscreen transitions otherwise cause a cross-frame resize loop.
  const scheduleResize = () => {
    if (resizeFrame !== undefined) return
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = undefined
      if (!lifetime.signal.aborted) resize()
    })
  }
  mountPlayerFullscreen(player, {
    signal: lifetime.signal,
    onError: notice,
    beforeNativeVideo: () => subtitles.setNative(true),
    changed: scheduleResize,
    webChanged: (active) => bridge.send("fullscreenWeb", { active }),
  })
  player.on("fullscreen", scheduleResize)
  const size = new ResizeObserver(scheduleResize)
  size.observe(root)
  video.addEventListener("loadedmetadata", scheduleResize, { signal: lifetime.signal })
  addEventListener("resize", scheduleResize, { signal: lifetime.signal })
  scheduleResize()
  addEventListener(
    "message",
    (event) => {
      if (event.source !== parent || event.data?.channel !== config.channel) return
      if (event.data.type === "theme") theme(event.data.theme, event.data.colors)
      if (event.data.type === "exitFullscreenWeb") player.fullscreenWeb = false
      if (event.data.type === "subtitleAppearance") {
        window.dispatchEvent(
          new CustomEvent("quartz-subtitle-appearance", { detail: event.data.value }),
        )
      }
    },
    { signal: lifetime.signal },
  )
  addEventListener(
    "quartz-subtitle-delay",
    (event) => subtitles.setDelay((event as CustomEvent<number>).detail),
    { signal: lifetime.signal },
  )
  addEventListener(
    "quartz-subtitle-appearance",
    (event) => {
      subtitles.setAppearance((event as CustomEvent).detail)
      config.preferences = { ...config.preferences, subtitleAppearance: subtitles.appearance }
    },
    { signal: lifetime.signal },
  )
  // Read-only diagnostics plus explicit player handles for real browser tests.
  global.__quartzMedia = {
    controller,
    player,
    subtitles,
    get snapshot() {
      return {
        state: controller.state,
        transport: transport.diagnostic,
        subtitleBusy: subtitleAction,
        subtitle: subtitles.diagnostic,
        frames: video.getVideoPlaybackQuality?.().totalVideoFrames,
        source: latest
          ? {
              method: latest.playMethod,
              type: latest.mediaType,
              burned: latest.subtitleStreamIndex,
            }
          : undefined,
      }
    },
  }
  addEventListener(
    "pagehide",
    () => {
      saveProgress(true)
      lifetime.abort()
      size.disconnect()
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame)
      danmaku?.dispose()
      subtitles.dispose()
      disposeControls()
      controller.dispose()
      bridge.dispose()
      player.destroy()
      assets.dispose()
    },
    { once: true },
  )
  bridge.ready()
  void loadDanmaku()
  let subtitlesInitialized = false
  function initializeSubtitles() {
    if (subtitlesInitialized) return
    subtitlesInitialized = true
    const selectedSubtitle = initialJellyfinSubtitle(
      config.nativeSubtitles || [],
      config.preferences?.subtitle,
      config.jellyfin.defaultSubtitleStreamIndex,
    )
    if (selectedSubtitle) {
      const selected = selectedSubtitle
      void subtitles
        .select(selected)
        .then(() => {
          if (subtitles.selected === selected) updateSubtitleControls()
        })
        .catch((error) => rightStatus.notice(error.message, "subtitle-result"))
    }
  }
  try {
    await controller.load(
      bridge.initial.then((source) => {
        latest = source
        initializeSubtitles()
        return source
      }),
      config.resumeTime || 0,
      config.autoplay === true,
    )
    if ((config.resumeTime || 0) >= 5)
      notice(
        `已续播至 ${Math.floor(controller.position / 60)}:${String(Math.floor(controller.position % 60)).padStart(2, "0")}`,
      )
  } catch (error) {
    await controller.fail(error as Error, (error as any).decode === true)
  }
}
