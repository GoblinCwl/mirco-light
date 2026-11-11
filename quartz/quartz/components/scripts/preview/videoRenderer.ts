import type {mountPlayerPanels} from "../playerPanels"
import type { mountPlayerFullscreen } from "../playerFullscreen"
import type { VideoPreferences } from "../driveVideoPreferences"
import type { SandboxPreview } from "./sandboxTypes"
import type { resumeSeekTarget } from "../videoResume"
import type { preferredSubtitle } from "../driveSubtitleSelection"
import type { embeddedASSFont } from "../assFonts"
export type VideoRendererContext = {
  config: SandboxPreview
  w: Window & Record<string, any>
  root: HTMLElement
  key: string
  frameAsset: (name: string, kind: "subtitle" | "player" | "preview") => Promise<ArrayBuffer>
  script: (url: string) => Promise<unknown>
  localScript: (name: string) => Promise<unknown>
  reportHeight: (height: number) => void
  send: (type: string, message?: string) => void
  resumeTargetFor: typeof resumeSeekTarget
  chooseSubtitle: typeof preferredSubtitle
  mountPanels: typeof mountPlayerPanels
  mountFullscreen: typeof mountPlayerFullscreen
  findEmbeddedFont: typeof embeddedASSFont
  playerSkinCSS: string
  element: <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    content?: string,
  ) => HTMLElementTagNameMap[K]
}
// Serialized into the preview iframe; retain explicit dependency injection.
export async function renderSandboxVideo(context: VideoRendererContext) {
  const {
    config,
    w,
    root,
    frameAsset,
    script,
    localScript,
    reportHeight,
    send,
    resumeTargetFor,
    chooseSubtitle,
    mountFullscreen,
    mountPanels,
    findEmbeddedFont,
    playerSkinCSS,
    element,
    key,
  } = context
  const preferences = config.preferences || {}
  let assResources:
    | Promise<{
        source: string
      }>
    | undefined
  let cjkFallback: Promise<string> | undefined
  const subtitleAsset = (name: string) => frameAsset(name, "subtitle")
  const playerScriptURLs: string[] = []
  const playerScript = async (name: string) => {
    const data = await frameAsset(name, "player")
    const url = URL.createObjectURL(new Blob([data], { type: "text/javascript" }))
    playerScriptURLs.push(url)
    await script(url)
  }
  addEventListener(
    "pagehide",
    () => {
      for (const url of playerScriptURLs) URL.revokeObjectURL(url)
    },
    { once: true },
  )
  // The parent owns persistent HTTP caching; the opaque frame only consumes
  // transferred bytes. Retain these object URLs for subsequent track changes.
  const prepareASS = () =>
    (assResources ??= (async () => {
      const [library, worker, wasm] = await Promise.all([
        subtitleAsset("subtitles-octopus.js"),
        subtitleAsset("subtitles-octopus-worker.js"),
        subtitleAsset("subtitles-octopus-worker.wasm"),
      ])
      const url = (data: ArrayBuffer, type: string) => {
        const value = URL.createObjectURL(new Blob([data], { type }))
        subtitleURLs.push(value)
        return value
      }
      const wasmURL = url(wasm, "application/wasm")
      await script(url(library, "text/javascript"))
      return {
        source: new TextDecoder()
          .decode(worker)
          .replaceAll('"subtitles-octopus-worker.wasm"', JSON.stringify(wasmURL)),
      }
    })().catch((error) => {
      assResources = undefined
      throw error
    }))
  const cjkFont = () =>
    (cjkFallback ??= subtitleAsset("SourceHanSansCN-Bold.woff2")
      .then((data) => {
        const url = URL.createObjectURL(new Blob([data], { type: "font/woff2" }))
        subtitleURLs.push(url)
        return url
      })
      .catch((error) => {
        cjkFallback = undefined
        throw error
      }))
  const persist = (patch: VideoPreferences) =>
    parent.postMessage({ channel: config.channel, type: "videoPreference", patch }, "*")
  const settingIcon = (name: string) => {
    const paths: Record<string, string> = {
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      subtitles:
        '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h4m3 0h3M7 14h2m3 0h5"/>',
      subtitleStyle: '<path d="m4 19 6-14 6 14M6 15h8m4-7h4m-2-2v13m-2-2 2 2 2-2"/>',
      subtitleDelay: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2m1 6h8m-3-3 3 3-3 3"/>',
      jellyfinQuality:
        '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m-5-8 3-3 3 2 4-5"/>',
      jellyfinAudio:
        '<path d="M5 13v-2a7 7 0 0 1 14 0v2M5 11H3v7h4v-7H5m14 0h2v7h-4v-7h2m0 7a3 3 0 0 1-3 3h-3"/>',
      quartzCompactDanmuku:
        '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h6m3 0h1M7 13h2m3 0h5"/>',
      quartzCompactDanmukuSettings:
        '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h10m-6-6v4m3 0v4"/>',
      skipIntroOutro: '<path d="m4 6 8 6-8 6V6Zm9 0 8 6-8 6V6ZM3 3h18M3 21h18"/>',
      "playback-rate": '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>',
      "aspect-ratio":
        '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9H6v3m10 3h2v-3"/>',
    }
    return `<svg class="quartz-setting-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.subtitles}</svg>`
  }
  // Player controls, tooltips and danmaku must stay inside the video frame,
  // rather than enlarging the mobile document's horizontal scroll area.
  document.documentElement.style.overflowX = "hidden"
  document.body.style.overflowX = "clip"
  root.style.width = "100%"
  root.style.maxWidth = "100%"
  let videoRatio =
    Number.isFinite(config.videoAspectRatio) && config.videoAspectRatio! > 0
      ? config.videoAspectRatio!
      : 16 / 9
  const sizeVideo = () => {
    // The iframe receives its height from this report. Capping the player
    // by innerHeight feeds the frame's temporary startup size back into
    // its own layout, leaving a one-pixel player after hidden initialization.
    const width = root.clientWidth
    if (width <= 0) return
    const height = width / videoRatio
    root.style.height = `${height}px`
    reportHeight(height + 24)
  }
  sizeVideo()
  const extension = config.mediaType || config.url.split("?")[0].split(".").at(-1)!.toLowerCase()
  // 5.3 uses a module Worker, which cannot start in an opaque sandbox.
  // 5.2 keeps the same player API and XML support with a classic Worker.
  // These standalone scripts only interact when the player is constructed.
  // Download them together on both cold visits and refreshes.
  await Promise.all([
    playerScript("artplayer.js"),
    ...(["m3u8", "m3u"].includes(extension) || key === "aliyun_video"
      ? [playerScript("hls.min.js")]
      : []),
    ...(["flv", "ts", "m2ts"].includes(extension) ? [localScript("mpegts.js")] : []),
  ])
  const engines: any[] = []
  const playerSkin = document.createElement("style")
  playerSkin.textContent = playerSkinCSS
  document.head.append(playerSkin)
  const subtitleLayout = document.createElement("style")
  subtitleLayout.textContent =
    ".libassjs-canvas-parent{position:absolute!important;inset:0;width:100%;height:100%;pointer-events:none}"
  document.head.append(subtitleLayout)
  let hls: any, transport: any, ass: any
  let initialHlsSource = true
  let mseResumeRequested = false
  const useNativeHls = (media: HTMLVideoElement) =>
    Boolean(media.canPlayType("application/vnd.apple.mpegurl"))
  let syncPlaybackLoading = () => {}
  let sourceStarted = false,
    activeMediaType = extension
  let firstSource: () => void = () => {}
  const firstSourceReady = new Promise<void>((resolve) => {
    firstSource = resolve
  })
  let burnedSubtitle = -1
  let assReady: Promise<void> = Promise.resolve(),
    assReadyTimer: ReturnType<typeof setTimeout> | undefined
  const statusStack = element("div", "")
  Object.assign(statusStack.style, {
    position: "absolute",
    top: "12px",
    right: "12px",
    left: "12px",
    zIndex: "45",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "6px",
    pointerEvents: "none",
  })
  const statusLine = (text: string) => {
    const line = element("span", text)
    line.setAttribute("role", "status")
    line.setAttribute("aria-live", "polite")
    Object.assign(line.style, {
      padding: "4px 9px",
      borderRadius: "4px",
      background: "var(--q-surface)",
      color: "var(--q-text)",
      fontSize: "13px",
      maxWidth: "100%",
      boxSizing: "border-box",
      overflowWrap: "anywhere",
      display: "none",
    })
    statusStack.append(line)
    return line
  }
  const subtitleLoading = statusLine("字幕加载中…")
  const setSubtitleLoading = (active: boolean) => {
    subtitleLoading.style.display = active ? "block" : "none"
    syncPlaybackLoading()
  }
  let subtitleRequest = 0
  const subtitleURLs: string[] = []
  let subtitleDelay =
    typeof preferences.subtitleDelay === "number" && Number.isFinite(preferences.subtitleDelay)
      ? Math.max(-60, Math.min(60, preferences.subtitleDelay))
      : 0
  const nativeCueTimes = new WeakMap<
    VTTCue,
    {
      start: number
      end: number
    }
  >()
  const applyNativeDelay = () => {
    for (const track of Array.from(video.textTracks)) {
      if (
        track === player.template.$track?.track ||
        !["subtitles", "captions"].includes(track.kind)
      )
        continue
      for (const cue of Array.from(track.cues || []) as VTTCue[]) {
        if (!nativeCueTimes.has(cue))
          nativeCueTimes.set(cue, { start: cue.startTime, end: cue.endTime })
        const original = nativeCueTimes.get(cue)!,
          start = Math.max(0, original.start + subtitleDelay),
          end = Math.max(start + 0.001, original.end + subtitleDelay)
        if (cue.startTime !== start) cue.startTime = start
        if (cue.endTime !== end) cue.endTime = end
      }
    }
  }
  const applySubtitleDelay = () => {
    if (ass) ass.timeOffset = -subtitleDelay
    applyNativeDelay()
    renderedTextCues = ""
    player.subtitle.update()
  }
  const cachedSubtitleStyle = preferences.subtitleStyle
  const subtitleStyle = {
    scale: Number.isFinite(cachedSubtitleStyle?.scale)
      ? Math.max(0.5, Math.min(2, cachedSubtitleStyle!.scale))
      : 1,
    x: Number.isFinite(cachedSubtitleStyle?.x)
      ? Math.max(-50, Math.min(50, cachedSubtitleStyle!.x))
      : 0,
    y: Number.isFinite(cachedSubtitleStyle?.y)
      ? Math.max(-50, Math.min(50, cachedSubtitleStyle!.y))
      : 0,
    bold: cachedSubtitleStyle?.bold === true,
  }
  let assOriginalContent = "",
    assBold = subtitleStyle.bold
  const boldASS = (content: string) => {
    if (!subtitleStyle.bold) return content
    let fields = 10
    return content
      .split("\n")
      .map((line) => {
        if (/^Format:.*\bText\s*$/i.test(line))
          fields = line.slice(line.indexOf(":") + 1).split(",").length
        if (!/^Dialogue:/i.test(line)) return line
        let offset = line.indexOf(":") + 1
        for (let i = 1; i < fields; i++) {
          const comma = line.indexOf(",", offset)
          if (comma < 0) return line
          offset = comma + 1
        }
        return line.slice(0, offset) + "{\\b1}" + line.slice(offset).replace(/\\b0\b/g, "\\b1")
      })
      .join("\n")
  }
  const nativeSubtitleStyle = document.createElement("style")
  document.head.append(nativeSubtitleStyle)
  const applySubtitleStyle = () => {
    // This renderer is serialized into an iframe and cannot close over imports.
    const subtitleFont = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol"'

    // Offset in player coordinates, independent of the subtitle canvas size.
    const transform = `translate(${(playerElement.clientWidth * subtitleStyle.x) / 100}px, ${(playerElement.clientHeight * subtitleStyle.y) / 100}px) scale(${subtitleStyle.scale})`
    for (const layer of [player.template.$subtitle, ass?.canvasParent]) {
      if (!(layer instanceof HTMLElement)) continue
      layer.style.transformOrigin = "center bottom"
      layer.style.transform = transform
    }
    player.template.$subtitle.style.fontFamily = subtitleFont
    player.template.$subtitle.style.fontWeight = subtitleStyle.bold ? "700" : "500"
    nativeSubtitleStyle.textContent = `video::cue{font-family:${subtitleFont};font-weight:${subtitleStyle.bold?700:400}}`
    if (ass && assOriginalContent && assBold !== subtitleStyle.bold) {
      assBold = subtitleStyle.bold
      ass.setTrack(boldASS(assOriginalContent))
    }
  }
  let assFonts = "",
    selectedSubtitle: any
  let loadedTextCues: VTTCue[] = []
  let windowRead: AbortController | undefined,
    windowPending = false,
    pendingTime = 0
  let windowFrom = -Infinity,
    windowUntil = -Infinity,
    appliedVersion = -1,
    retryAfter = 0
  let refreshEmbedded: (force?: boolean) => Promise<void> = async () => {}
  let nativePresentation = false
  const resizeASS = () => {
    if (
      !ass?.canvasParent ||
      nativePresentation ||
      !["ass", "ssa"].includes(selectedSubtitle?.type)
    )
      return
    // Keep libass's sibling canvas anchored to the player, outside normal
    // flow. Re-measure after Safari restores the inline video rectangle.
    Object.assign(ass.canvasParent.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    })
    ass.resize()
    ass.canvasParent.style.position = "absolute"
    applySubtitleStyle()
    ass.timeOffset = -subtitleDelay
  }
  const syncSubtitleLayers = () => {
    if (ass?.canvasParent) {
      ass.canvasParent.style.display =
        burnedSubtitle < 0 && ["ass", "ssa"].includes(selectedSubtitle?.type) ? "block" : "none"
      ass.canvasParent.style.visibility = nativePresentation ? "hidden" : "visible"
    }
    player.subtitle.show =
      burnedSubtitle < 0 &&
      !nativePresentation &&
      Boolean(selectedSubtitle?.url) &&
      !["ass", "ssa", "pgs"].includes(selectedSubtitle?.type)
    applySubtitleStyle()
    applySubtitleDelay()
  }
  const subtitleText = async (url: string) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) })
    if (!response.ok) throw new Error(`字幕读取失败（${response.status}）`)
    const data = new Uint8Array(await response.arrayBuffer())
    if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder("utf-16le").decode(data)
    if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder("utf-16be").decode(data)
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(data)
    } catch {
      return new TextDecoder("gb18030").decode(data)
    }
  }
  const renderSubtitle = async (item: any, content: string, request: number) => {
    if (request !== subtitleRequest) return
    if (["ass", "ssa"].includes(item.type)) {
      assOriginalContent = content
      assBold = subtitleStyle.bold
      content = boldASS(content)
      const embeddedFont = findEmbeddedFont(content)
      const fonts = (item.fonts || []).join("|") + (embeddedFont ? "|embedded" : "|cjk")
      if (ass && fonts !== assFonts) {
        ass.dispose()
        ass = undefined
      }
      if (!ass) {
        const fallback = embeddedFont
          ? (() => {
              const url = URL.createObjectURL(
                new Blob([embeddedFont as BlobPart], { type: "font/ttf" }),
              )
              subtitleURLs.push(url)
              return Promise.resolve(url)
            })()
          : cjkFont()
        const [resources, fallbackFont] = await Promise.all([prepareASS(), fallback])
        // libass-wasm's onReady fires on its first worker message, including
        // log output before WASM/fonts finish loading. Acknowledge actual
        // library/track initialization instead, using its known ready target.
        const source =
          resources.source +
          `
;(() => {
  const initialized = Module.onRuntimeInitialized;
  Module.onRuntimeInitialized = function () {
    initialized.apply(this, arguments);
    postMessage({ target: "ready", quartzSubtitleReady: "initial" });
  };
  const receive = self.onmessage;
  self.onmessage = function (event) {
    const result = receive.call(this, event);
    if (event.data.target === "set-track") postMessage({ target: "ready", quartzSubtitleReady: "track" });
    return result;
  };
})();`
        const workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
        subtitleURLs.push(workerUrl)
        if (request !== subtitleRequest) return
        assFonts = fonts
        clearTimeout(assReadyTimer)
        assReady = new Promise<void>((resolve, reject) => {
          const done = (event: MessageEvent) => {
            if (event.data?.quartzSubtitleReady !== "initial") return
            clearTimeout(assReadyTimer)
            ass.worker.removeEventListener("message", done)
            resolve()
          }
          const failed = () => {
            clearTimeout(assReadyTimer)
            ass?.worker?.removeEventListener("message", done)
            player.notice.show = "字幕渲染失败"
            reject(new Error("字幕渲染失败"))
          }
          assReadyTimer = setTimeout(() => {
            reject(new Error("字幕渲染加载超时"))
          }, 45000)
          ass = new w.SubtitlesOctopus({
            video: player.template.$video,
            subContent: content,
            workerUrl,
            fonts: item.fonts || [],
            fallbackFont,
            availableFonts: embeddedFont
              ? {}
              : {
                  "times new roman":
                    "https://media.goblincwl.site/static/fonts/TimesNewRoman.ttf?v=preview-1",
                },
            onError: failed,
          })
          ass.worker.addEventListener("message", done)
        })
        // libass inserts a sibling with no stacking level. Artplayer's
        // video is at 10; match its native subtitle layer at 20 so the
        // canvas is visible without covering danmaku or player controls.
        ass.canvasParent.style.zIndex = "20"
        ass.canvasParent.style.pointerEvents = "none"
      } else {
        await assReady
        if (request !== subtitleRequest) return
        assReady = new Promise<void>((resolve, reject) => {
          const worker: Worker = ass.worker
          const done = (event: MessageEvent) => {
            if (event.data?.quartzSubtitleReady !== "track") return
            clearTimeout(assReadyTimer)
            worker.removeEventListener("message", done)
            resolve()
          }
          worker.addEventListener("message", done)
          assReadyTimer = setTimeout(() => {
            worker.removeEventListener("message", done)
            reject(new Error("字幕切换加载超时"))
          }, 45000)
          ass.setTrack(content)
        })
      }
      await assReady
      if (request !== subtitleRequest) return
      if (ass.canvasParent) {
        ass.canvasParent.style.display = "block"
        ass.canvasParent.style.visibility = nativePresentation ? "hidden" : "visible"
      }
      resizeASS()
      ass.setRate(video.playbackRate)
      ass.setIsPaused(video.paused || video.seeking, video.currentTime - subtitleDelay)
      ass.setCurrentTime(video.currentTime - subtitleDelay)
    } else {
      // Firefox can retain a loaded-but-empty native metadata track after
      // an HLS source switch in this opaque frame. Keep the downloaded cue
      // timestamps as a fallback instead of depending on that track cache.
      const clock = (value: string) =>
        value
          .replace(",", ".")
          .split(":")
          .reduce((total, part) => total * 60 + Number(part), 0)
      loadedTextCues = content
        .replace(/\r\n?/g, "\n")
        .split(/\n\s*\n/)
        .flatMap((block) => {
          const lines = block.split("\n")
          if (/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) return []
          const index = lines.findIndex((line) =>
            /^\s*(?:\d+:)?\d{2}:\d{2}[.,]\d{3}\s+-->/.test(line),
          )
          const match = lines[index]?.match(
            /^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[.,]\d{3})/,
          )
          if (!match) return []
          const start = clock(match[1]),
            end = clock(match[2])
          return Number.isFinite(start) && Number.isFinite(end) && end > start
            ? [new VTTCue(start, end, lines.slice(index + 1).join("\n"))]
            : []
        })
      const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }))
      subtitleURLs.push(url)
      await player.subtitle.switch(url, { type: item.type })
      if (request === subtitleRequest) player.subtitle.show = !nativePresentation
    }
  }
  const switchSubtitle = async (item: any, _wasPlaying?: boolean) => {
    const request = ++subtitleRequest
    selectedSubtitle = item
    loadedTextCues = []
    syncSubtitleLayers()
    windowRead?.abort()
    windowPending = false
    windowFrom = windowUntil = -Infinity
    appliedVersion = -1
    retryAfter = 0
    if (ass?.canvasParent) ass.canvasParent.style.display = "none"
    player.subtitle.show = false
    if (item.embedded) {
      await refreshEmbedded(true)
      return
    }
    setSubtitleLoading(Boolean(item.url) || item.type === "pgs")
    try {
      if (item.url) {
        // Fetch the renderer alongside the subtitle body; decide whether a
        // fallback font is needed only after examining the used styles.
        if (["ass", "ssa"].includes(item.type)) void prepareASS().catch(() => {})
        await renderSubtitle(item, await subtitleText(item.url), request)
      }
    } catch (error) {
      throw error
    } finally {
      if (request === subtitleRequest) setSubtitleLoading(false)
    }
  }
  let playbackReady = false,
    subtitleSelection = 0,
    subtitleSwitchPending = false,
    subtitleSwitchResume = false
  let sourceSwitchPending = false
  let playerDisposed = false,
    playerFailure = ""
  const player = new w.Artplayer({
    container: root,
    poster: config.cover || "",
    moreVideoAttr: { playsInline: true, preload: "auto" },
    url: "",
    type:
      key === "aliyun_video" || extension === "m3u"
        ? "m3u8"
        : extension === "m2ts"
          ? "ts"
          : extension,
    autoplay: false,
    theme: config.colors.accent,
    volume: Math.min(1, preferences.volume ?? 0.7),
    muted: preferences.muted ?? false,
    playbackRate: true,
    aspectRatio: true,
    setting: true,
    fullscreen: true,
    fullscreenWeb: true,
    screenshot: false,
    quality: config.qualities || [],
    plugins: [],
    icons: config.playerIcons || {},
    customType: {
      m3u8: (video: HTMLVideoElement, url: string) => {
        hls?.destroy()
        hls = undefined
        // Safari's native HLS handles its HEVC and iPhone playback constraints.
        // Prefer it to MSE/MMS whenever the browser advertises native support.
        if (useNativeHls(video)) video.src = url
        else if (w.Hls?.isSupported()) {
          const position =
            initialHlsSource && Number.isFinite(config.resumeTime) && config.resumeTime! >= 5
              ? config.resumeTime!
              : -1
          initialHlsSource = false
          mseResumeRequested = position >= 5
          const bufferLength = 30
          const engine = (hls = new w.Hls({
            startPosition: position,
            manifestLoadingTimeOut: 20000,
            maxBufferLength: bufferLength,
            maxMaxBufferLength: bufferLength,
            videoPreference: { preferHDR: true },
          }))
          engine.loadSource(url)
          engine.attachMedia(video)
          engines.push(engine)
        } else video.src = url
      },
      flv: (video: HTMLVideoElement, url: string) => {
        if (!w.mpegts?.isSupported()) throw new Error("浏览器不支持此视频")
        transport?.destroy()
        const engine = (transport = w.mpegts.createPlayer({ type: "flv", url }))
        engine.attachMediaElement(video)
        engine.load()
        engines.push(engine)
      },
      ts: (video: HTMLVideoElement, url: string) => {
        transport?.destroy()
        const engine = (transport = w.mpegts.createPlayer({ type: "mpegts", url }))
        engine.attachMediaElement(video)
        engine.load()
        engines.push(engine)
      },
    },
  })
  const video = player.template.$video as HTMLVideoElement
  const assignMediaSource = (url: string, type = activeMediaType) => {
    activeMediaType = type
    player.type = type
    if (!["m3u8", "m3u"].includes(type)) {
      hls?.destroy()
      hls = undefined
    }
    player.url = url
  }
  addEventListener("message", (event) => {
    if (
      event.source !== parent ||
      event.data?.channel !== config.channel ||
      event.data.type !== "videoStart" ||
      sourceStarted ||
      typeof event.data.url !== "string"
    )
      return
    video.preload = "auto"
    sourceStarted = true
    assignMediaSource(event.data.url, event.data.mediaType || activeMediaType)
    firstSource()
    if (playbackReady && config.autoplay) void player.play().catch(() => {})
  })
  const playerElement = player.template.$player as HTMLElement
  playerElement.classList.add("quartz-player")
  const playbackLoading = () =>
    !playbackReady ||
    subtitleSwitchPending ||
    sourceSwitchPending ||
    video.seeking ||
    (sourceStarted && !video.paused && video.readyState < 3)
  syncPlaybackLoading = () => {
    const active = !playerFailure && playbackLoading()
    playerElement.classList.toggle("is-playback-loading", active)
    player.loading.show = active
  }
  for (const event of [
    "seeking",
    "seeked",
    "waiting",
    "canplay",
    "playing",
    "pause",
    "loadeddata",
    "error",
  ])
    video.addEventListener(event, syncPlaybackLoading)
  const resumePlayback = () => {
    if (!playbackReady || !sourceStarted) return
    void player.play().catch(() => {
      player.notice.show = "点击播放继续观看"
    })
  }
  const switchQualityPreservingPlayback = async (
    url: string,
    wasPlaying: boolean,
    _position = video.currentTime,
    _timeoutMs = 30000,
    _mediaType = activeMediaType,
  ) => {
    if (playerDisposed) throw new DOMException("播放器已退出", "AbortError")
    sourceSwitchPending = true
    syncPlaybackLoading()
    try {
      clearResume()
      // Artplayer's playing getter also checks readyState. Capture paused
      // directly before negotiation, so buffering cannot erase play intent.
      video.preload = "auto"
      {
        const switching = player.switchQuality(url)
        if (wasPlaying) resumePlayback()
        await switching
      }
      if (wasPlaying) resumePlayback()
    } finally {
      sourceSwitchPending = false
      syncPlaybackLoading()
    }
  }
  if (config.qualities?.length)
    player.controls.update({
      name: "quality",
      onSelect: async (item: any) => {
        await switchQualityPreservingPlayback(item.url, !video.paused && !video.ended)
        return item.html
      },
    })
  for (const name of ["playback-rate", "aspect-ratio"]) {
    const option = player.setting.find(name)
    if (option) option.icon = settingIcon(name)
  }
  const styleControls = new Map<
    string,
    {
      input: HTMLInputElement
      output: HTMLOutputElement
    }
  >()
  let boldControl: HTMLInputElement | undefined
  const styleValue = (key: "scale" | "x" | "y") =>
    key === "scale" ? Math.round(subtitleStyle.scale * 100) : subtitleStyle[key]
  const styleLabel = (key: "scale" | "x" | "y") =>
    `${key !== "scale" && styleValue(key) > 0 ? "+" : ""}${styleValue(key)}%`
  const styleSlider = (key: "scale" | "x" | "y", label: string, min: number, max: number) => ({
    name: `subtitleStyle-${key}`,
    html: label,
    mounted: (row: HTMLElement) => {
      row.classList.add("quartz-subtitle-style-row")
      const caption = element("label", label),
        input = document.createElement("input"),
        output = document.createElement("output")
      input.type = "range"
      input.min = String(min)
      input.max = String(max)
      input.step = "1"
      input.value = String(styleValue(key))
      input.setAttribute("aria-label", label)
      output.textContent = styleLabel(key)
      caption.append(input)
      row.replaceChildren(caption, output)
      styleControls.set(key, { input, output })
      input.addEventListener("input", () => {
        subtitleStyle[key] = Number(input.value) / (key === "scale" ? 100 : 1)
        output.textContent = styleLabel(key)
        applySubtitleStyle()
        persist({ subtitleStyle: { ...subtitleStyle } })
      })
      // Stop Artplayer's selector handler before it navigates back or closes.
      row.addEventListener("click", (event) => event.stopImmediatePropagation(), {
        capture: true,
      })
      row.addEventListener("keydown", (event) => event.stopPropagation())
    },
  })
  const resetSubtitleStyle = () => {
    Object.assign(subtitleStyle, { scale: 1, x: 0, y: 0, bold: false })
    if (boldControl) boldControl.checked = false
    for (const key of ["scale", "x", "y"] as const) {
      const control = styleControls.get(key)
      if (control) {
        control.input.value = String(styleValue(key))
        control.output.textContent = styleLabel(key)
      }
    }
    applySubtitleStyle()
    persist({ subtitleStyle: { ...subtitleStyle } })
  }
  let subtitleStyleMenu = false
  const addSubtitleStyle = () => {
    if (subtitleStyleMenu) return
    subtitleStyleMenu = true
    player.setting.add({
      name: "subtitleStyle",
      icon: settingIcon("subtitleStyle"),
      html: "字幕样式",
      selector: [
        styleSlider("scale", "大小", 50, 200),
        styleSlider("x", "X 偏移", -50, 50),
        styleSlider("y", "Y 偏移", -50, 50),
        {
          name: "subtitleStyle-bold",
          html: "加粗",
          mounted: (row: HTMLElement) => {
            row.classList.add("quartz-subtitle-style-row")
            const label = element("label", "加粗"),
              input = document.createElement("input")
            input.type = "checkbox"
            input.checked = subtitleStyle.bold
            input.setAttribute("aria-label", "字幕加粗")
            input.style.cssText = "flex:0 0 auto;width:18px;height:18px;margin-left:auto"
            boldControl = input
            label.append(input)
            row.replaceChildren(label)
            input.addEventListener("change", () => {
              subtitleStyle.bold = input.checked
              applySubtitleStyle()
              persist({ subtitleStyle: { ...subtitleStyle } })
            })
            row.addEventListener("click", (event) => event.stopImmediatePropagation(), {
              capture: true,
            })
            row.addEventListener("keydown", (event) => event.stopPropagation())
          },
        },
        {
          name: "subtitleStyle-reset",
          html: "恢复默认",
          mounted: (row: HTMLElement) => {
            row.addEventListener(
              "click",
              (event) => {
                event.stopImmediatePropagation()
                resetSubtitleStyle()
              },
              { capture: true },
            )
          },
        },
      ],
      onSelect: () => "",
    })
  }
  applySubtitleStyle()
  // Artplayer otherwise reads textTracks[0], which can become an HLS
  // rendition rather than its own selected metadata track. Cue changes
  // also follow the media clock, ahead of a stalled/late video frame.
  const framedVideo = video as unknown as {
    requestVideoFrameCallback?: (
      callback: (
        now: number,
        frame: {
          mediaTime: number
        },
      ) => void,
    ) => number
    cancelVideoFrameCallback?: (handle: number) => void
  }
  let textFrameTime: number | undefined,
    textFrameHandle: number | undefined,
    textFrameEpoch = 0,
    textClockDisposed = false
  let renderedTextCues = ""
  const updateText = player.subtitle.update.bind(player.subtitle)
  Object.defineProperty(player.subtitle, "textTrack", {
    configurable: true,
    get: () => player.template.$track?.track,
  })
  Object.defineProperty(player.subtitle, "activeCues", {
    configurable: true,
    get: () => {
      if (textFrameTime === undefined) return []
      const native = player.template.$track?.track?.cues
      return (native?.length ? Array.from(native) : loadedTextCues).filter(
        (cue: any) =>
          cue.startTime <= textFrameTime! - subtitleDelay &&
          cue.endTime > textFrameTime! - subtitleDelay,
      )
    },
  })
  player.subtitle.update = () => {
    const cues = player.subtitle.activeCues as VTTCue[]
    const identity = JSON.stringify(cues.map((cue) => [cue.startTime, cue.endTime, cue.text]))
    if (identity === renderedTextCues) return
    renderedTextCues = identity
    updateText()
  }
  const refreshTextFrame = (time: number) => {
    if (!Number.isFinite(time) || video.seeking) return
    textFrameTime = time
    if (!["ass", "ssa", "pgs"].includes(selectedSubtitle?.type)) player.subtitle.update()
  }
  const queueTextFrame = () => {
    if (!framedVideo.requestVideoFrameCallback || textClockDisposed) return
    const epoch = textFrameEpoch
    textFrameHandle = framedVideo.requestVideoFrameCallback((_now, frame) => {
      if (epoch !== textFrameEpoch || textClockDisposed) return
      textFrameHandle = undefined
      refreshTextFrame(frame.mediaTime)
      queueTextFrame()
    })
  }
  const resetTextFrames = () => {
    ++textFrameEpoch
    if (textFrameHandle !== undefined) framedVideo.cancelVideoFrameCallback?.(textFrameHandle)
    textFrameHandle = undefined
    textFrameTime = undefined
    player.subtitle.update()
    queueTextFrame()
  }
  video.addEventListener("seeking", resetTextFrames)
  video.addEventListener("loadstart", resetTextFrames)
  video.addEventListener("emptied", resetTextFrames)
  if (framedVideo.requestVideoFrameCallback) queueTextFrame()
  else {
    const refresh = () => {
      if (!video.seeking && (video.paused ? video.readyState >= 2 : video.readyState >= 3))
        refreshTextFrame(video.currentTime)
    }
    for (const event of ["timeupdate", "loadeddata", "seeked", "playing"])
      video.addEventListener(event, refresh)
  }
  player.on("subtitleLoad", () => {
    renderedTextCues = ""
    player.subtitle.update()
  })
  let subtitleDelayMenu = false
  const addSubtitleDelay = () => {
    if (subtitleDelayMenu) return
    subtitleDelayMenu = true
    player.setting.add({
      name: "subtitleDelay",
      icon: settingIcon("subtitleDelay"),
      html: "字幕偏移",
      tooltip: subtitleDelay ? `${subtitleDelay > 0 ? "+" : ""}${subtitleDelay} 秒` : "0 秒",
      selector: [
        {
          name: "subtitleDelay-value",
          html: "时间",
          mounted: (row: HTMLElement) => {
            row.classList.add("quartz-subtitle-style-row")
            const label = element("label", "延后"),
              input = document.createElement("input"),
              output = document.createElement("output")
            input.type = "range"
            input.min = "-60"
            input.max = "60"
            input.step = ".1"
            input.value = String(subtitleDelay)
            input.setAttribute("aria-label", "字幕时间偏移（秒，正值延后）")
            const update = () => {
              output.textContent = `${subtitleDelay > 0 ? "+" : ""}${subtitleDelay.toFixed(1)} 秒`
            }
            update()
            label.append(input)
            row.replaceChildren(label, output)
            const change = () => {
              subtitleDelay = Math.round(Number(input.value) * 10) / 10
              update()
              applySubtitleDelay()
              persist({ subtitleDelay })
              player.setting.find("subtitleDelay").tooltip = output.textContent
            }
            input.addEventListener("input", change)
            row.addEventListener("click", (event) => event.stopImmediatePropagation(), {
              capture: true,
            })
            row.addEventListener("keydown", (event) => event.stopPropagation())
            row.dataset.subtitleDelayControl = ""
            row.addEventListener("quartz-reset-delay", () => {
              input.value = "0"
              change()
            })
          },
        },
        {
          name: "subtitleDelay-reset",
          html: "恢复默认",
          mounted: (row: HTMLElement) => {
            row.addEventListener(
              "click",
              (event) => {
                event.stopImmediatePropagation()
                playerElement
                  .querySelector("[data-subtitle-delay-control]")
                  ?.dispatchEvent(new Event("quartz-reset-delay"))
              },
              { capture: true },
            )
          },
        },
      ],
      onSelect: () => "",
    })
  }
  video.addEventListener("timeupdate", applyNativeDelay)
  video.textTracks.addEventListener("addtrack", (event) => {
    const track = (event as TrackEvent).track
    if (track && "cues" in track) track.addEventListener("cuechange", applyNativeDelay)
  })
  let resumePending =
    Number.isFinite(config.resumeTime) && config.resumeTime! >= 5 ? config.resumeTime! : 0
  let resumeSeeking = false,
    resumePlaying = false,
    resumeTarget = 0
  let resumeTimer: ReturnType<typeof setTimeout> | undefined, resumeFrame: number | undefined
  const nativeHls = () => ["m3u8", "m3u"].includes(activeMediaType) && useNativeHls(video)
  const clearResume = () => {
    resumePending = 0
    resumeSeeking = false
    clearTimeout(resumeTimer)
    resumeTimer = undefined
    if (resumeFrame !== undefined) framedVideo.cancelVideoFrameCallback?.(resumeFrame)
    resumeFrame = undefined
  }
  const confirmResume = (frameTime: number) => {
    if (
      !resumeSeeking ||
      video.seeking ||
      video.readyState < 2 ||
      Math.abs(video.currentTime - resumeTarget) > 2 ||
      Math.abs(frameTime - video.currentTime) > 2
    )
      return false
    clearResume()
    player.notice.show = `已续播至 ${Math.floor(video.currentTime / 60)}:${String(Math.floor(video.currentTime % 60)).padStart(2, "0")}`
    return true
  }
  const watchResumeFrame = () => {
    if (!resumeSeeking || !framedVideo.requestVideoFrameCallback) return
    resumeFrame = framedVideo.requestVideoFrameCallback((_now, frame) => {
      resumeFrame = undefined
      if (!confirmResume(frame.mediaTime)) watchResumeFrame()
    })
  }
  const restoreProgress = () => {
    // Native HLS can advertise its whole seekable timeline before Safari
    // has decoded a frame. A pre-play seek may change only currentTime and
    // leave playback stuck. Wait for the first actual playing event.
    if (!resumePending || resumeSeeking || !sourceStarted) return
    // HLS.js already seeks through startPosition. Like Jellyfin Web, wait
    // for playing before applying a correction; a metadata-time second
    // seek can cancel the very fragment needed to finish the initial seek.
    const target = resumeTargetFor(
      video,
      resumePending,
      nativeHls(),
      resumePlaying,
      mseResumeRequested,
    )
    if (target === undefined) return
    resumeSeeking = true
    resumeTarget = target
    resumeTimer = setTimeout(() => {
      if (!resumeSeeking) return
      const playing = !video.paused
      clearResume()
      // A failed native seek must not leave the controls/subtitle clock
      // permanently pinned at an unconfirmed saved position.
      if (nativeHls()) {
        video.load()
        if (playing) void video.play().catch(() => {})
      }
      player.notice.show = "恢复进度未成功，请手动调整播放位置"
    }, 15000)
    try {
      if (Math.abs(video.currentTime - target) >= 1) video.currentTime = target
      watchResumeFrame()
    } catch {
      clearTimeout(resumeTimer)
      resumeTimer = undefined
      resumeSeeking = false
    }
  }
  video.addEventListener("playing", () => {
    resumePlaying = true
    restoreProgress()
  })
  // seeked/currentTime alone do not prove that Safari presented the frame.
  // Older engines without frame callbacks must advance after the seek.
  video.addEventListener("timeupdate", () => {
    if (
      !framedVideo.requestVideoFrameCallback &&
      !video.paused &&
      video.currentTime > resumeTarget + 0.1
    )
      confirmResume(video.currentTime)
  })
  video.addEventListener("seeked", () => {
    if (!framedVideo.requestVideoFrameCallback && !nativeHls()) confirmResume(video.currentTime)
  })
  playerElement.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof Element && event.target.closest(".art-control-progress"))
        clearResume()
    },
    { capture: true },
  )
  addEventListener("pagehide", clearResume, { once: true })
  let lastProgressSave = 0
  const saveProgress = (force = false) => {
    if (
      resumePending ||
      resumeSeeking ||
      sourceSwitchPending ||
      playerDisposed ||
      !sourceStarted ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    )
      return
    if (!force && Date.now() - lastProgressSave < 5000) return
    lastProgressSave = Date.now()
    parent.postMessage(
      {
        channel: config.channel,
        type: "videoProgress",
        position: video.currentTime,
        duration: video.duration,
        ended: video.ended,
      },
      "*",
    )
  }
  for (const event of ["loadedmetadata", "canplay", "playing", "progress", "durationchange"])
    video.addEventListener(event, restoreProgress)
  video.addEventListener("timeupdate", () => saveProgress())
  for (const event of ["pause", "seeked", "ended"])
    video.addEventListener(event, () => saveProgress(true))
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveProgress(true)
  })
  addEventListener("pagehide", () => saveProgress(true), { once: true })
  const skippableSegments =
    config.timeline?.segments.filter(
      (item) =>
        ["Intro", "Outro"].includes(item.type) &&
        Number.isFinite(item.start) &&
        Number.isFinite(item.end) &&
        item.start >= 0 &&
        item.end > item.start,
    ) || []
  let skipIntroOutro = skippableSegments.length > 0 && preferences.skipIntroOutro === true
  const skippedSegments = new Set<string>()
  if (skippableSegments.length)
    player.setting.add({
      name: "skipIntroOutro",
      icon: settingIcon("skipIntroOutro"),
      html: "跳过片头片尾",
      switch: skipIntroOutro,
      onSwitch: () => {
        skipIntroOutro = !skipIntroOutro
        skippedSegments.clear()
        persist({ skipIntroOutro })
        return skipIntroOutro
      },
    })
  video.addEventListener("timeupdate", () => {
    if (!skipIntroOutro || !playbackReady || video.paused || video.seeking || resumePending) return
    const segment = skippableSegments.find(
      (item) =>
        video.currentTime >= item.start &&
        video.currentTime < item.end - 0.1 &&
        !skippedSegments.has(`${item.type}:${item.start}`),
    )
    if (!segment) return
    const end = Math.min(
      segment.end,
      Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.01) : segment.end,
    )
    if (!(end > video.currentTime)) return
    skippedSegments.add(`${segment.type}:${segment.start}`)
    video.currentTime = end
    player.notice.show = `已跳过${segment.text}`
  })
  addEventListener(
    "pagehide",
    () => {
      textClockDisposed = true
      ++textFrameEpoch
      if (textFrameHandle !== undefined) framedVideo.cancelVideoFrameCallback?.(textFrameHandle)
    },
    { once: true },
  )
  let currentVolume = Math.max(0, Math.min(2, preferences.volume ?? 0.7))
  let audioContext: AudioContext | undefined,
    volumeGain: GainNode | undefined,
    volumeSource: MediaElementAudioSourceNode | undefined
  const volumeInputs = new Set<HTMLInputElement>(),
    volumeLabels = new Set<HTMLElement>()
  const renderVolume = () => {
    const percent = Math.round((video.muted ? 0 : currentVolume) * 100)
    for (const input of volumeInputs) input.value = String(percent)
    for (const label of volumeLabels) label.textContent = `${percent}%`
  }
  const activateVolumeBoost = () => {
    try {
      if (!audioContext) {
        const Audio = w.AudioContext || w.webkitAudioContext
        if (!Audio) return false
        const context: AudioContext = new Audio()
        const gain = context.createGain()
        const source = context.createMediaElementSource(video)
        gain.gain.value = Math.max(1, currentVolume)
        source.connect(gain)
        gain.connect(context.destination)
        audioContext = context
        volumeGain = gain
        volumeSource = source
      }
      if (audioContext.state === "suspended") void audioContext.resume().catch(() => {})
      return true
    } catch {
      return false
    }
  }
  const setVolume = (value: number) => {
    let next = Math.max(0, Math.min(2, Math.round(value * 100) / 100))
    const unavailable = next > 1 && !activateVolumeBoost()
    if (unavailable) next = 1
    currentVolume = next
    video.volume = Math.min(1, next)
    video.muted = next === 0
    if (volumeGain && audioContext)
      volumeGain.gain.setValueAtTime(Math.max(1, next), audioContext.currentTime)
    renderVolume()
    persist({ volume: currentVolume, muted: video.muted })
    player.notice.show = unavailable
      ? "当前浏览器不支持音量增强，已设为 100%"
      : `音量 ${Math.round(currentVolume * 100)}%`
  }
  // Replace Artplayer's native-volume shortcuts (clamped at 100%) while
  // retaining its focus/input guards and the other keyboard shortcuts.
  for (const [key, step] of [
    ["ArrowUp", 0.1],
    ["ArrowDown", -0.1],
  ] as const) {
    for (const handler of [...(player.hotkey.keys[key] || [])]) player.hotkey.remove(key, handler)
    player.hotkey.add(key, () => setVolume((video.muted ? 0 : currentVolume) + step))
  }
  const volumePanel = playerElement.querySelector<HTMLElement>(".art-volume-inner")
  if (volumePanel) {
    const output = element("output"),
      slider = document.createElement("input")
    output.className = "quartz-volume-value"
    slider.className = "quartz-volume-slider"
    slider.type = "range"
    slider.min = "0"
    slider.max = "200"
    slider.step = "1"
    slider.setAttribute("aria-label", "音量（最高 200%）")
    volumeInputs.add(slider)
    volumeLabels.add(output)
    volumePanel.replaceChildren(output, slider)
    slider.addEventListener("input", () => setVolume(Number(slider.value) / 100))
  }

  renderVolume()
  let lastVolume = currentVolume,
    lastMuted = preferences.muted ?? false
  let lastRate = preferences.playbackRate || 1,
    lastRatio = preferences.aspectRatio || "default"
  video.defaultPlaybackRate = lastRate
  player.playbackRate = lastRate
  player.aspectRatio = lastRatio
  player.on("video:volumechange", () => {
    if (Math.abs(video.volume - Math.min(1, currentVolume)) > 0.001) {
      currentVolume = video.volume
      if (volumeGain && audioContext) volumeGain.gain.setValueAtTime(1, audioContext.currentTime)
    }
    renderVolume()
    if (currentVolume === lastVolume && video.muted === lastMuted) return
    lastVolume = currentVolume
    lastMuted = video.muted
    persist({ volume: lastVolume, muted: lastMuted })
  })
  addEventListener(
    "pagehide",
    () => {
      volumeSource?.disconnect()
      volumeGain?.disconnect()
      void audioContext?.close().catch(() => {})
    },
    { once: true },
  )
  player.on("video:ratechange", () => {
    if (video.playbackRate === lastRate) return
    lastRate = video.playbackRate
    video.defaultPlaybackRate = lastRate
    persist({ playbackRate: lastRate })
  })
  player.on("aspectRatio", (value: string) => {
    if (value !== lastRatio) {
      lastRatio = value
      persist({ aspectRatio: value })
    }
  })
  player.on("quality", (value: any) => {
    const quality = String(value?.html || "").match(/\d{3,4}/)?.[0]
    if (quality) persist({ quality })
  })
  playerElement.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey || !event.deltaY) return
      const target = event.target instanceof Element ? event.target : undefined
      if (
        target?.closest(
          ".art-settings,.apd-config-panel,.art-selector-list,.art-contextmenus,.art-volume-panel,input,textarea,select",
        )
      )
        return
      event.preventDefault()
      event.stopPropagation()
      setVolume((player.muted ? 0 : currentVolume) + (event.deltaY < 0 ? 0.05 : -0.05))
    },
    { passive: false, capture: true },
  )
  playerElement.classList.add("is-subtitle-pending")
  player.loading.show = true
  const play = video.play.bind(video)
  video.play = () => {
    if (!playbackReady) return Promise.resolve()
    if (subtitleSwitchPending) {
      subtitleSwitchResume = true
      return Promise.resolve()
    }
    if (currentVolume > 1 && !activateVolumeBoost()) {
      currentVolume = 1
      renderVolume()
      persist({ volume: 1 })
    }
    if (audioContext?.state === "suspended") void audioContext.resume().catch(() => {})
    return play()
  }
  video.addEventListener(
    "play",
    () => {
      if (!playbackReady || subtitleSwitchPending) video.pause()
    },
    true,
  )
  player.on("loading", (active: boolean) => {
    if (!active && playbackLoading()) player.loading.show = true
    // iOS may not fetch metadata until the first user-initiated play().
    // Artplayer's loading state hides that very play button, so a paused
    // player must expose it once the source and subtitles are ready.
    else if (active && !playbackLoading() && playbackReady && video.paused)
      player.loading.show = false
  })
  if (config.mediaShare)
    playerElement.addEventListener(
      "contextmenu",
      (event) => {
        event.preventDefault()
        event.stopImmediatePropagation()
      },
      true,
    )
  const panelLifetime=new AbortController()
  addEventListener("pagehide",()=>panelLifetime.abort(),{once:true})
  mountPanels(player,root,config.channel,panelLifetime.signal)
  const settingsHeading = element("div")
  settingsHeading.className = "quartz-settings-heading"
  const closeSettings = element("button")
  closeSettings.innerHTML=settingIcon("close")
  closeSettings.type = "button"
  closeSettings.setAttribute("aria-label", "关闭播放设置")
  closeSettings.onclick = () => {
    player.setting.show = false
  }
  settingsHeading.append(element("span", "播放设置"), closeSettings)
  const settingsPanel = playerElement.querySelector<HTMLElement>(".art-settings")!
  settingsPanel.prepend(settingsHeading)
  let trackMarqueeFrame = 0,
    trackMarqueeRow: HTMLElement | undefined
  let trackMarqueeLabels: {
    element: HTMLElement
    distance: number
  }[] = []
  const stopTrackMarquee = () => {
    cancelAnimationFrame(trackMarqueeFrame)
    trackMarqueeFrame = 0
    trackMarqueeRow = undefined
    for (const { element } of trackMarqueeLabels) {
      element.scrollLeft = 0
      element.classList.remove("is-track-scrolling")
    }
    trackMarqueeLabels = []
  }
  settingsPanel.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch" || !(event.target instanceof Element)) return
    const row = event.target.closest<HTMLElement>(".art-setting-item")
    if (!row || row === trackMarqueeRow) return
    stopTrackMarquee()
    const option = player.setting.find(row.dataset.name)
    if (
      ![option?.name, option?.$parent?.name].some((name) =>
        ["subtitles", "jellyfinAudio"].includes(name),
      )
    )
      return
    trackMarqueeLabels = Array.from(
      row.querySelectorAll<HTMLElement>(
        ".art-setting-item-left-text,.art-setting-item-right-tooltip",
      ),
    )
      .map((element) => ({ element, distance: element.scrollWidth - element.clientWidth }))
      .filter((label) => label.distance > 1)
    if (!trackMarqueeLabels.length) return
    trackMarqueeRow = row
    for (const { element } of trackMarqueeLabels) element.classList.add("is-track-scrolling")
    let started: number | undefined
    const animate = (now: number) => {
      started ??= now
      for (const { element, distance } of trackMarqueeLabels) {
        const travel = (distance / 28) * 1000,
          phase = (now - started) % (travel * 2 + 1800)
        element.scrollLeft =
          phase < 800
            ? 0
            : phase < 800 + travel
              ? ((phase - 800) / travel) * distance
              : phase < 1800 + travel
                ? distance
                : distance * (1 - (phase - 1800 - travel) / travel)
      }
      trackMarqueeFrame = requestAnimationFrame(animate)
    }
    trackMarqueeFrame = requestAnimationFrame(animate)
  })
  settingsPanel.addEventListener("pointerout", (event) => {
    if (
      trackMarqueeRow &&
      (!(event.relatedTarget instanceof Node) || !trackMarqueeRow.contains(event.relatedTarget))
    )
      stopTrackMarquee()
  })
  player.on("setting", (active: boolean) => {
    if (!active) stopTrackMarquee()
  })
  addEventListener("pagehide", stopTrackMarquee, { once: true })
  let activeSettingsPanel: Element | null = null
  const settingsStructure = new MutationObserver(() => {
    const active = settingsPanel.querySelector(".art-setting-panel.art-current")
    if (active !== activeSettingsPanel) {
      activeSettingsPanel = active
      settingsPanel.scrollTop = 0
      stopTrackMarquee()
    }
  })
  settingsStructure.observe(settingsPanel, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  })
  addEventListener("pagehide", () => settingsStructure.disconnect(), { once: true })
  const fitControls = () => {
    const width = playerElement.clientWidth
    playerElement.style.setProperty("--quartz-state-size", `${Math.max(28, Math.min(68, Math.min(width, playerElement.clientHeight) * .12))}px`)
    playerElement.classList.toggle("quartz-player-compact", width < 600)
    applySubtitleStyle()
    player.setting.resize()
  }
  const controlsSize = new ResizeObserver(fitControls)
  controlsSize.observe(playerElement)
  fitControls()
  addEventListener("pagehide", () => controlsSize.disconnect(), { once: true })
  player.template.$player.append(statusStack)
  video.addEventListener("webkitbeginfullscreen", () => {
    nativePresentation = true
    syncSubtitleLayers()
  })
  const syncNativePresentation = () => {
    const mode = (video as any).webkitPresentationMode
    nativePresentation =
      mode === "fullscreen" ||
      mode === "picture-in-picture" ||
      document.pictureInPictureElement === video ||
      Boolean((video as any).webkitDisplayingFullscreen)
    syncSubtitleLayers()
    if (!nativePresentation)
      requestAnimationFrame(() => {
        fitVideo()
        resizeASS()
      })
  }
  const restoreInlineSubtitles = (event?:Event) => {
    if(event?.type==="webkitendfullscreen") {
      // The end event is authoritative while WebKit's fullscreen flag can lag.
      nativePresentation=(video as any).webkitPresentationMode==="picture-in-picture" || document.pictureInPictureElement===video
      if(!nativePresentation)for(const track of Array.from(video.textTracks))track.mode="disabled"
      syncSubtitleLayers()
      requestAnimationFrame(()=>{fitVideo();resizeASS()})
    } else syncNativePresentation()
    setTimeout(syncNativePresentation, 300)
  }
  video.addEventListener("webkitendfullscreen", restoreInlineSubtitles)
  video.addEventListener("webkitpresentationmodechanged", restoreInlineSubtitles)
  video.addEventListener("enterpictureinpicture", () => {
    nativePresentation = true
    syncSubtitleLayers()
  })
  video.addEventListener("leavepictureinpicture", restoreInlineSubtitles)
  document.addEventListener("visibilitychange", syncNativePresentation)
  video.textTracks.addEventListener("addtrack", () => {
    if (selectedSubtitle) syncSubtitleLayers()
  })
  if (config.episodes) {
    for (const [direction, label, index, path] of [
      ["previous", "上一集", 5, "M5 5h2v14H5zm3 7 11-7v14z"],
      ["next", "下一集", 15, "M17 5h2v14h-2zM5 5l11 7-11 7z"],
    ] as const) {
      const target = config.episodes[direction]
      const activate = () => {
        if (target)
          parent.postMessage({ channel: config.channel, type: "videoEpisode", direction }, "*")
      }
      player.controls.add({
        name: `${direction}Episode`,
        position: "left",
        index,
        tooltip: label,
        html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`,
        style: {
          width: "28px",
          minWidth: "28px",
          padding: "0",
          opacity: target ? "1" : ".3",
          cursor: target ? "pointer" : "default",
        },
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
  const fitVideo = () => {
    if (nativePresentation) return
    if (video.videoWidth && video.videoHeight) videoRatio = video.videoWidth / video.videoHeight
    // Fullscreen owns the player dimensions, but subtitles still need the
    // first real video dimensions when playback starts inside that mode.
    if (!player.fullscreen && !player.fullscreenWeb) sizeVideo()
    resizeASS()
  }
  mountFullscreen(player, {
    onError: message => { restoreInlineSubtitles(); player.notice.show = message },
    beforeNativeVideo: () => { nativePresentation = true; syncSubtitleLayers() },
    changed: () => requestAnimationFrame(fitVideo),
    webChanged: active => parent.postMessage({ channel: config.channel, type: "fullscreenWeb", active }, "*"),
  })
  player.on("fullscreenWeb", () => {
    requestAnimationFrame(fitVideo)
  })
  const videoSize = new ResizeObserver(fitVideo)
  videoSize.observe(root)
  videoSize.observe(video)
  videoSize.observe(playerElement)
  video.addEventListener("resize", fitVideo)
  addEventListener("resize", fitVideo)
  addEventListener("pagehide", () => videoSize.disconnect(), { once: true })
  addEventListener("message", (event) => {
    if (
      event.source === parent &&
      event.data?.channel === config.channel &&
      event.data.type === "exitFullscreenWeb"
    )
      player.fullscreenWeb = false
  })
  player.on("error", () => {
    send("error", "浏览器无法播放此视频")
  })
  const subtitleKey = (item: any): string => {
    if (!item.url && !item.embedded && item.type !== "pgs") return "off"
    if (item.key) return item.key
    const stem = config.name.replace(/\.[^.]*$/, "").toLowerCase()
    let name = String(item.name || "").toLowerCase()
    if (name.startsWith(stem)) name = name.slice(stem.length)
    return JSON.stringify([item.language || "", item.type || "", name])
  }
  const preferredSubtitle = (choices: any[]) => chooseSubtitle(choices, config.name)
  const cachedSubtitles = []
  const subtitleChoices: any[] = [...(config.subtitles || [])]
  let subtitleMenu = false,
    embeddedOpening = false
  const updateSubtitleMenu = () => {
    const textControls =
      burnedSubtitle < 0 &&
      subtitleChoices.some((item) => item.type !== "pgs") &&
      selectedSubtitle?.type !== "pgs"
    if (textControls) {
      addSubtitleStyle()
      addSubtitleDelay()
    }
    for (const name of ["subtitleStyle", "subtitleDelay"]) {
      const option = player.setting.find(name)
      if (option) option.$item.style.display = textControls ? "" : "none"
    }
    const active = Boolean(
      selectedSubtitle?.url || selectedSubtitle?.embedded || selectedSubtitle?.type === "pgs",
    )
    const tooltip = active
      ? selectedSubtitle.html || selectedSubtitle.name
      : embeddedOpening && !subtitleRequest
        ? "识别中"
        : "关闭"
    const option = {
      name: "subtitles",
      icon: settingIcon("subtitles"),
      html: "字幕",
      mounted: (row: HTMLElement) => row.classList.add("quartz-track-item"),
      tooltip,
      selector: [
        { html: "关闭", url: "", default: !active && !embeddedOpening },
        ...subtitleChoices.map((item, index) => ({
          html: item.name,
          ...item,
          sourceName: item.name,
          name: `quartz-subtitle-${index}`,
          mounted: (row: HTMLElement) => row.classList.add("quartz-track-item"),
          default:
            item === selectedSubtitle ||
            Boolean(
              item.type === "pgs" &&
              selectedSubtitle?.type === "pgs" &&
              item.index === selectedSubtitle.index,
            ) ||
            Boolean(item.url && item.url === selectedSubtitle?.url) ||
            Boolean(
              item.embedded &&
              item.trackNumber === selectedSubtitle?.trackNumber &&
              selectedSubtitle?.embedded,
            ),
        })),
        ...(embeddedOpening ? [{ html: "正在识别内嵌字幕…", pending: true }] : []),
      ],
      onSelect: (item: any) => {
        if (item.pending || subtitleSwitchPending || sourceSwitchPending) return tooltip
        const wasPlaying = subtitleSwitchPending
          ? subtitleSwitchResume
          : !video.paused && !video.ended
        subtitleSwitchPending = true
        subtitleSwitchResume = wasPlaying
        syncPlaybackLoading()
        player.pause()
        player.setting.show = false
        const previousSubtitle = selectedSubtitle
        const selection = ++subtitleSelection,
          selected = { ...item, name: item.sourceName ?? item.name }
        selectedSubtitle = selected
        updateSubtitleMenu()
        void switchSubtitle(selected, wasPlaying)
          .then(() => {
            if (selection === subtitleSelection) persist({ subtitle: subtitleKey(selected) })
          })
          .catch(() => {
            if (selection !== subtitleSelection) return
            if (
              previousSubtitle?.type === "pgs"
                ? burnedSubtitle === previousSubtitle.index
                : burnedSubtitle < 0
            ) {
              selectedSubtitle = previousSubtitle
              updateSubtitleMenu()
              syncSubtitleLayers()
            }
            player.notice.show = "字幕切换失败，请重试"
          })
          .finally(() => {
            if (selection !== subtitleSelection) return
            const resume = subtitleSwitchResume
            subtitleSwitchPending = false
            subtitleSwitchResume = false
            if (resume) resumePlayback()
            syncPlaybackLoading()
          })
        return item.html
      },
    }
    if (subtitleMenu) player.setting.update(option)
    else {
      player.setting.add(option)
      subtitleMenu = true
    }
  }
  let initialSubtitleLoad: Promise<unknown> =
    preferences.subtitle === "off" ? switchSubtitle({ name: "关闭", url: "" }) : Promise.resolve()
  if (subtitleChoices.length) {
    const stem = config.name.replace(/\.[^.]*$/, "").toLowerCase()
    const eligible = cachedSubtitles.length
      ? subtitleChoices
      : subtitleChoices.filter((item) => {
          const name = item.name.replace(/\.[^.]*$/, "").toLowerCase()
          return name === stem || name.startsWith(stem + ".")
        })
    const initial =
      preferences.subtitle === "off"
        ? undefined
        : subtitleChoices.find((item) => subtitleKey(item) === preferences.subtitle) ||
          preferredSubtitle(eligible)
    if (initial)
      initialSubtitleLoad = switchSubtitle(initial).catch(() => {
        player.notice.show = "字幕加载失败"
      })
    updateSubtitleMenu()
  }
  const embeddedController = new AbortController()
  const embeddedFonts = new Map<any, string>()
  let seekTimer: ReturnType<typeof setTimeout> | undefined
  refreshEmbedded = async (force = false) => {
    const item = selectedSubtitle
    if (!item?.embedded || embeddedController.signal.aborted) return
    const time = video.currentTime
    if (
      !force &&
      (video.seeking ||
        seekTimer ||
        Date.now() < retryAfter ||
        (time >= windowFrom && time < windowUntil - 20) ||
        (windowPending && Math.abs(time - pendingTime) < 15))
    )
      return
    windowRead?.abort()
    const controller = (windowRead = new AbortController()),
      request = ++subtitleRequest
    if (force || appliedVersion < 0) setSubtitleLoading(true)
    windowPending = true
    pendingTime = time
    try {
      const result = await item.embedded.readWindow(
        item.trackNumber,
        time,
        AbortSignal.any([controller.signal, embeddedController.signal, AbortSignal.timeout(30000)]),
      )
      if (request !== subtitleRequest || controller.signal.aborted) return
      windowFrom = result.from
      windowUntil = result.until
      item.fonts = result.fonts.map((font: any) => {
        if (!embeddedFonts.has(font)) {
          const url = URL.createObjectURL(
            new Blob([font.data], { type: "application/octet-stream" }),
          )
          embeddedFonts.set(font, url)
          subtitleURLs.push(url)
        }
        return embeddedFonts.get(font)
      })
      if (force || appliedVersion !== result.version) {
        await renderSubtitle(item, result.content, request)
        if (request === subtitleRequest) appliedVersion = result.version
      }
    } catch (error) {
      if (
        !controller.signal.aborted &&
        !embeddedController.signal.aborted &&
        request === subtitleRequest
      ) {
        retryAfter = Date.now() + 5000
        player.notice.show = error instanceof Error ? error.message : "当前时间附近的字幕读取失败"
      }
    } finally {
      if (windowRead === controller) windowPending = false
      if (request === subtitleRequest) setSubtitleLoading(false)
    }
  }
  player.on("video:timeupdate", () => {
    void refreshEmbedded()
  })
  player.on("video:seeking", () => {
    if (!selectedSubtitle?.embedded) return
    windowRead?.abort()
    clearTimeout(seekTimer)
    seekTimer = setTimeout(() => {
      seekTimer = undefined
      void refreshEmbedded(true)
    }, 120)
  })
  player.on("video:seeked", () => {
    if (!selectedSubtitle?.embedded) return
    clearTimeout(seekTimer)
    seekTimer = undefined
    void refreshEmbedded(true)
  })
  if (key === "video" && /\.mkv$/i.test(config.name) && config.matroskaReader && true) {
    embeddedOpening = true
    setSubtitleLoading(true)
    updateSubtitleMenu()
    initialSubtitleLoad = Promise.all([
      initialSubtitleLoad,
      (async () => {
        await script(config.matroskaReader!)
        if (embeddedController.signal.aborted) return
        const embedded = await w.QuartzMatroska.openSubtitles(config.subtitleUrl || config.url, {
          size: config.size,
          signal: AbortSignal.any([embeddedController.signal, AbortSignal.timeout(45000)]),
        })
        if (embeddedController.signal.aborted) return
        embeddedOpening = false
        const choices = embedded.tracks.map((track: any) => {
          const language = track.metadata.language
          let label = track.metadata.trackName || language || `轨道 ${track.metadata.trackNumber}`
          try {
            if (!track.metadata.trackName && language)
              label = new Intl.DisplayNames(["zh-CN"], { type: "language" }).of(language) || label
          } catch {
            /* Retain the container's language code. */
          }
          return {
            name: `内嵌字幕 · ${label}`,
            language: language || "",
            type: track.type,
            trackNumber: track.metadata.trackNumber,
            isDefault: track.metadata.isDefault,
            embedded,
          }
        })
        subtitleChoices.push(...choices)
        // Preserve an explicit selection (including Off), or a matching
        // external subtitle already loaded while discovery was running.
        const cachedChoice = choices.find((item: any) => subtitleKey(item) === preferences.subtitle)
        if (
          !subtitleSelection &&
          (!subtitleRequest || cachedChoice) &&
          choices.length &&
          preferences.subtitle !== "off"
        ) {
          const initial = cachedChoice || preferredSubtitle(choices)
          await switchSubtitle(initial).catch(() => {
            player.notice.show = "内嵌字幕加载失败"
          })
        }
        updateSubtitleMenu()
      })().catch((error: Error) => {
        if (!embeddedController.signal.aborted) {
          embeddedOpening = false
          updateSubtitleMenu()
          console.warn("MKV subtitles", error)
          player.notice.show = error.message || "内嵌字幕读取失败"
        }
      }),
    ])
  }
  addEventListener(
    "pagehide",
    () => {
      playerDisposed = true
      embeddedController.abort()
      windowRead?.abort()
      clearTimeout(seekTimer)
      clearTimeout(assReadyTimer)
      ++subtitleRequest
      for (const engine of engines) engine.destroy()
      ass?.dispose()
      player.destroy()
      for (const url of subtitleURLs) URL.revokeObjectURL(url)
    },
    { once: true },
  )
  // Embedded mobile browsers may defer metadata until a user presses play.
  // Expose the controls now; metadata only refines the reserved aspect ratio.
  video.addEventListener("loadedmetadata", fitVideo)
  let subtitleLayoutFrame = 0
  let firstSubtitleFrame: number | undefined
  const subtitleVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number
    cancelVideoFrameCallback?: (id: number) => void
  }
  const refreshInlineSubtitleFrame = () => {
    cancelAnimationFrame(subtitleLayoutFrame)
    subtitleLayoutFrame = requestAnimationFrame(() => {
      if (nativePresentation || embeddedController.signal.aborted) return
      syncSubtitleLayers()
      resizeASS()
      if (ass && ["ass", "ssa"].includes(selectedSubtitle?.type)) {
        ass.setRate(video.playbackRate)
        ass.setIsPaused(video.paused || video.seeking, video.currentTime - subtitleDelay)
        ass.setCurrentTime(video.currentTime - subtitleDelay)
      }
      player.subtitle.update()
    })
  }
  for (const event of ["loadedmetadata", "loadeddata", "playing", "seeked"])
    video.addEventListener(event, refreshInlineSubtitleFrame)
  video.addEventListener("playing", () => {
    if (firstSubtitleFrame !== undefined)
      subtitleVideo.cancelVideoFrameCallback?.(firstSubtitleFrame)
    firstSubtitleFrame = subtitleVideo.requestVideoFrameCallback?.(() => {
      firstSubtitleFrame = undefined
      refreshInlineSubtitleFrame()
    })
  })
  addEventListener(
    "pagehide",
    () => {
      cancelAnimationFrame(subtitleLayoutFrame)
      if (firstSubtitleFrame !== undefined)
        subtitleVideo.cancelVideoFrameCallback?.(firstSubtitleFrame)
    },
    { once: true },
  )
  const revealPreloadControls = () => {
    if (playerFailure) {
      player.loading.show = false
      return
    }
    if (video.readyState === 0 && video.paused) {
      player.loading.show = !playbackReady
      player.mask.show = true
      player.controls.show = true
    }
  }
  video.addEventListener("loadstart", revealPreloadControls)
  revealPreloadControls()
  fitVideo()
  void Promise.all([initialSubtitleLoad, firstSourceReady]).finally(() => {
    if (embeddedController.signal.aborted) return
    playbackReady = true
    setSubtitleLoading(false)
    playerElement.classList.remove("is-subtitle-pending")
    syncPlaybackLoading()
    player.mask.show = video.paused
    player.controls.show = true
    if (sourceStarted && config.autoplay) void player.play().catch(() => {})
  })
}
