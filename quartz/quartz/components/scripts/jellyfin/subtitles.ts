import {mountAssClock} from "./assClock"
import { subtitleGeometry } from "./subtitleGeometry"
import {
  normalizeSubtitleAppearance,
  subtitleAppearanceStyles,
  type SubtitleAppearance,
} from "../subtitleAppearance"
import { embeddedASSFont } from "../assFonts"
import { createPgsSubtitleRenderer } from "../pgsSubtitleRenderer"
import type { PlayerAssets } from "./assets"
import type { PlayerConfig, SubtitleTrack } from "./types"

type SubtitleEvents = {
  selection?: (track?: SubtitleTrack) => void
  status: (message: string) => void
  notice: (message: string) => void
  burn: (index: number) => Promise<void>
  burned: () => number
}
/** No second playback clock: native VTT, libass and libpgs all follow this video.
 * Every selection has one cancellation token; a stale response cannot attach. */
export class SubtitleManager {
  selected?: SubtitleTrack
  private request?: AbortController
  private assLoading=false
  private assFallback=false
  private ass: any
  private pgs?: ReturnType<typeof createPgsSubtitleRenderer>
  private canvas?: HTMLCanvasElement
  private track?: HTMLTrackElement
  private bodyUrl?: string
  private lifetime = new AbortController()
  private cachedVtt = ""
  private restoringTrack = false
  private native = false
  private visible = true
  private delay: number
  appearance: SubtitleAppearance
  private textOverlay?: HTMLDivElement
  private textContent?: HTMLDivElement
  private textCues: VTTCue[] = []
  private css = document.createElement("style")
  private cueTimes = new WeakMap<TextTrackCue, { start: number; end: number }>()
  constructor(
    private video: HTMLVideoElement,
    private config: PlayerConfig,
    private assets: PlayerAssets,
    private events: SubtitleEvents,
  ) {
    this.delay = config.preferences?.subtitleDelay || 0
    this.appearance = normalizeSubtitleAppearance(config.preferences?.subtitleAppearance)
    document.head.append(this.css)
    this.updateStyle()
    video.addEventListener(
      "loadedmetadata",
      () => {
        void this.restoreTrack()
      },
      { signal: this.lifetime.signal },
    )
    for(const event of ["seeking","seeked"])video.addEventListener(event,()=>this.sync(),{signal:this.lifetime.signal})
    video.textTracks.addEventListener?.("addtrack", () => this.sync(), {signal:this.lifetime.signal})
    video.textTracks.addEventListener?.("change", () => {if(!this.native)this.sync()}, {signal:this.lifetime.signal})
  }
  get customizable() {
    return !!this.selected && this.selected.type !== "pgs" && this.events.burned() < 0
  }
  get appearanceEditable() {
    return (
      !!this.selected &&
      !["ass", "ssa", "pgs"].includes(this.selected.type) &&
      this.events.burned() < 0
    )
  }
  get diagnostic() {
    return {
      selected: this.selected?.name,
      type: this.selected?.type,
      delay: this.delay,
      cues: Array.from(this.track?.track.activeCues || []).map((c) => (c as VTTCue).text),
    }
  }
  private clear() {
    this.assLoading=false
    this.assFallback=false
    this.cachedVtt = ""
    this.textOverlay?.remove()
    this.textOverlay = undefined
    this.textContent = undefined
    this.textCues = []
    this.ass?.dispose()
    this.ass = undefined
    this.pgs?.dispose()
    this.pgs = undefined
    this.canvas?.remove()
    this.canvas = undefined
    if (this.track) {
      this.track.track.mode = "disabled"
      this.track.remove()
      this.track = undefined
    }
    if (this.bodyUrl) {
      URL.revokeObjectURL(this.bodyUrl)
      this.bodyUrl = undefined
    }
  }
  async select(track?: SubtitleTrack, allowFallback = true) {
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    this.clear()
    this.selected = track
    this.events.selection?.(track)
    const burn = !!track && (track.burn || track.type === "pgs" && (!this.config.jellyfin.pgsRender || this.native))
    this.events.status(track ? burn?"Jellyfin 正在准备字幕烧录…":"字幕加载中…" : "")
    try {
      if (this.events.burned() !== (burn ? track!.index : -1))
        await this.events.burn(burn ? track!.index! : -1)
      if (request.signal.aborted) return
      if (!track || burn) return
      if (track.type === "pgs") await this.renderPgs(track, request)
      else if (["ass","ssa"].includes(track.type)) await this.renderAssProgressive(track,request)
      else {
        const response = await fetch(track.url, {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
        })
        if (!response.ok) throw new Error(`字幕读取失败（${response.status}）`)
        const content = await response.text()
        if (request.signal.aborted) return
        await this.renderVtt(content, track, request)
      }
      if(request.signal.aborted)return
      this.resize()
      this.sync()
    } catch (error) {
      if (request.signal.aborted) return
      this.clear()
      if (track && !burn && allowFallback && Number.isInteger(track.index)) {
        this.events.status("字幕切换为 Jellyfin 烧录…")
        await this.events.burn(track.index!)
        this.events.notice("字幕渲染失败，已使用 Jellyfin 烧录")
      } else throw error
    } finally {
      if (this.request === request) this.events.status(this.assLoading&&this.assFallback?"字幕字体加载中…":"")
    }
  }
  private async nativeTrack(track: SubtitleTrack, request: AbortController) {
    try {
      const response = await fetch(track.nativeUrl!, { signal: AbortSignal.any([request.signal,AbortSignal.timeout(45000)]) })
      if (!response.ok) return false
      const content = await response.text()
      if (request.signal.aborted) return false
      await this.renderVtt(content, track, request)
      this.resize()
      this.sync()
      return true
    } catch {
      if (this.native && !request.signal.aborted)
        this.events.notice("原生全屏字幕加载失败，可退出全屏重试")
      return false
    }
  }
  private async renderVtt(content: string, track: SubtitleTrack, request: AbortController) {
    if (!/^\uFEFF?WEBVTT/.test(content) && !/^WEBVTT/.test(content))
      throw new Error("无效的 WebVTT 字幕")
    this.cachedVtt = content
    this.textOverlay?.remove()
    this.textOverlay = undefined
    this.textContent = undefined
    this.textCues = []
    if (this.track) {
      this.track.track.mode = "disabled"
      this.track.remove()
      this.track = undefined
    }
    if (this.bodyUrl) {
      URL.revokeObjectURL(this.bodyUrl)
      this.bodyUrl = undefined
    }
    const element = document.createElement("track")
    element.kind = "subtitles"
    // Safari requires a default track with custom video controls. Only the
    // selected track is mounted; sync() still owns showing/hidden/disabled.
    element.default = true
    element.label = track.name
    element.srclang = track.language || "und"
    if (this.assFallback || !["ass", "ssa"].includes(track.type)) {
      const overlay = document.createElement("div")
      const text = document.createElement("div")
      Object.assign(overlay.style, {
        position: "absolute",
        inset: "0",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: "20",
      })
      Object.assign(text.style, {
        maxWidth: "70%",
        textAlign: "center",
        whiteSpace: "pre-line",
        lineHeight: "normal",
      })
      overlay.append(text)
      this.video.parentElement?.append(overlay)
      this.textOverlay = overlay
      this.textContent = text
      element.track.addEventListener("cuechange", () => this.renderText(), {
        signal: request.signal,
      })
    }
    this.bodyUrl = URL.createObjectURL(new Blob([content], { type: "text/vtt" }))
    element.src = this.bodyUrl
    this.track = element
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("字幕加载超时")), 15000)
      const finish = (error?: Error) => {
        clearTimeout(timer)
        request.signal.removeEventListener("abort", cancel)
        error ? reject(error) : resolve()
      }
      const cancel = () => finish(new DOMException("字幕选择已更新", "AbortError"))
      element.onload = () => {
        this.applyDelay()
        this.updateStyle()
        finish()
      }
      element.onerror = () => finish(new Error("浏览器无法加载字幕"))
      request.signal.addEventListener("abort", cancel, { once: true })
      this.video.append(element)
      element.track.mode = "hidden"
    })
  }
  private async renderAssProgressive(track:SubtitleTrack,request:AbortController) {
    this.assLoading=true
    this.assFallback=true
    const primary=(async()=>{
      const response=await fetch(track.url,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(45000)])})
      if(!response.ok)throw new Error(`字幕读取失败（${response.status}）`)
      const content=await response.text()
      if(request.signal.aborted)return
      await this.renderAss(content,request)
      if(request.signal.aborted)return
      this.assLoading=false;this.assFallback=false
      this.resize();this.sync();this.events.status("")
    })()
    if(!track.nativeUrl){await primary;return}
    const fallback=this.nativeTrack(track,request).then(loaded=>{
      if(!loaded)throw new Error("文字字幕暂不可用")
    })
    // Normal text can release the selection while fonts/worker continue loading.
    // A later upgrade keeps the same selection and media position.
    void primary.catch(async()=>{
      try{await fallback}catch{return}
      if(request.signal.aborted)return
      this.assLoading=false;this.ass?.dispose();this.ass=undefined
      this.sync();this.events.status("")
      this.events.notice("ASS 样式暂不可用，继续使用普通字幕")
    })
    try{await Promise.any([primary,fallback])}
    catch(error){throw (error as AggregateError).errors?.[0]||error}
  }
  private async renderAss(content: string, request: AbortController) {
    const embedded = embeddedASSFont(content)
    const [workerUrl, fallbackFont] = await Promise.all([
      this.assets.assWorker(),
      embedded
        ? Promise.resolve(this.assets.url(embedded as BlobPart, "font/ttf"))
        : this.assets.fallbackFont(),
    ])
    if (request.signal.aborted) return
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      const finish = (error?: Error) => {
        clearTimeout(timer)
        request.signal.removeEventListener("abort", cancel)
        error ? reject(error) : resolve()
      }
      const cancel = () => finish(new DOMException("字幕选择已更新", "AbortError"))
      this.ass = new (window as any).SubtitlesOctopus({
        video: this.video,
        subContent: content,
        workerUrl,
        fallbackFont,
        timeOffset: -this.delay,
        onError: () => finish(new Error("ASS 字幕渲染失败")),
      })
      const renderer=this.ass
      let clockReady=false
      renderer.worker.addEventListener("message", (event: MessageEvent) => {
        if (event.data?.quartzSubtitleReady === "initial" && !clockReady && !request.signal.aborted) {
          clockReady=true
          mountAssClock(this.video,renderer,request.signal,()=>this.delay)
          finish()
        }
      })
      timer = setTimeout(() => finish(new Error("ASS 字幕初始化超时")), 45000)
      request.signal.addEventListener("abort", cancel, { once: true })
      Object.assign(this.ass.canvasParent.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        zIndex: "20",
        pointerEvents: "none",
        visibility:"hidden",
      })
    })
  }
  private async renderPgs(track: SubtitleTrack, request: AbortController) {
    const { library, workerUrl } = await this.assets.pgs()
    if (request.signal.aborted) return
    this.canvas = document.createElement("canvas")
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      zIndex: "20",
      pointerEvents: "none",
      objectFit: "contain",
    })
    this.video.parentElement!.append(this.canvas)
    this.pgs = createPgsSubtitleRenderer(
      library,
      {
        video: this.video,
        canvas: this.canvas,
        subUrl: track.url,
        workerUrl,
        timeOffset: -this.delay,
      },
      () => {
        if (!request.signal.aborted)
          void this.events.burn(track.index!).catch(() => this.events.notice("PGS 字幕烧录失败"))
      },
    )
    request.signal.addEventListener("abort", () => this.pgs?.dispose(), { once: true })
    await this.pgs.ready
  }
  private async restoreTrack() {
    const request = this.request,
      track = this.selected
    if (
      !this.visible ||
      this.restoringTrack ||
      !request ||
      request.signal.aborted ||
      !track ||
      !this.cachedVtt ||
      this.track?.readyState !== 2 ||
      (this.track.track.cues?.length || 0) !== 0
    )
      return
    this.restoringTrack = true
    try {
      await this.renderVtt(this.cachedVtt, track, request)
      if (!request.signal.aborted) this.sync()
    } catch {
      if (!request.signal.aborted) this.events.notice("字幕重新挂载失败，请重新选择字幕")
    } finally {
      this.restoringTrack = false
    }
  }
  setVisible(value: boolean) {
    if (this.visible === value) return
    this.visible = value
    if (value) void this.restoreTrack()
    this.sync()
  }
  setNative(value: boolean) {
    if(this.native===value){this.sync();return}
    this.native = value
    // End events can precede WebKit's presentation-mode property update.
    // Disable every native rendition before restoring our inline renderer.
    if(!value)for(const track of Array.from(this.video.textTracks))track.mode="disabled"
    this.updateStyle()
    if (value && this.selected?.type === "pgs" && this.events.burned() < 0) {
      void this.select(this.selected).catch(()=>this.events.notice("原生全屏字幕切换失败"))
    }
    this.sync()
  }
  setDelay(value: number) {
    this.delay = value
    this.applyDelay()
  }
  setAppearance(value: unknown) {
    this.appearance = normalizeSubtitleAppearance(value)
    this.updateStyle()
    this.sync()
  }
  private updateStyle() {
    const appearance = subtitleAppearanceStyles(this.appearance)
    const native = subtitleAppearanceStyles(this.appearance, false)
    const mediaAspect =
      this.video.videoWidth && this.video.videoHeight
        ? this.video.videoWidth / this.video.videoHeight
        : this.config.videoAspectRatio || 16 / 9
    const geometry = subtitleGeometry(
      this.video.clientWidth,
      this.video.clientHeight,
      mediaAspect,
      globalThis.screen?.width || 0,
      globalThis.screen?.height || 0,
    )
    const scale = geometry?.scale ?? 1
    const rootSize =
      typeof getComputedStyle === "function" && document.documentElement
        ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        : 16
    // Native browser cues use the same picture-relative size; custom text is
    // scaled as a whole so its line spacing, margins and shadow scale together.
    const typographyScale=geometry?geometry.referenceWidth/(mediaAspect>=1?1920:1080):1
    const nativeSize = parseFloat(appearance.fontSize) * rootSize * scale * typographyScale
    // The OS fullscreen caption compositor chooses its own reference viewport.
    // Feeding it inline CSS pixels can magnify them a second time on iOS.
    const sizeRule=this.native?"":`font-size:${nativeSize}px;`
    const shadow = native.textShadow.replace(/7px/g, `${7 * scale}px`)
    this.css.textContent = `video::cue{font-family:${native.fontFamily};${sizeRule}font-weight:${native.fontWeight};font-variant:${native.fontVariant};color:${native.color};background:transparent;text-shadow:${shadow}}`
    if (geometry && this.textOverlay) {
      Object.assign(this.textOverlay.style, {
        inset: "auto",
        left: `${(this.video.offsetLeft || 0) + geometry.x}px`,
        top: `${(this.video.offsetTop || 0) + geometry.y}px`,
        width: `${geometry.referenceWidth}px`,
        height: `${geometry.referenceHeight}px`,
        transformOrigin: "top left",
        transform: `scale(${geometry.scale})`,
      })
    }
    if (this.textContent) Object.assign(this.textContent.style, appearance,{
      fontSize:`${parseFloat(appearance.fontSize)*typographyScale}rem`,
      webkitTextSizeAdjust:"none",textSizeAdjust:"none",
    })
    if (this.textOverlay)
      this.textOverlay.style.justifyContent =
        this.appearance.verticalPosition < 0 ? "flex-end" : "flex-start"
    for (const cue of Array.from(this.track?.track.cues || []) as VTTCue[]) {
      cue.snapToLines = true
      const position = this.appearance.verticalPosition
      cue.line = position < 0 ? position - (cue.text.match(/\n/g) || []).length : position
    }
  }
  private applyDelay() {
    if (this.ass) this.ass.timeOffset = -this.delay
    if (this.pgs) this.pgs.renderer.timeOffset = -this.delay
    for (const cue of Array.from(this.track?.track.cues || [])) {
      let original = this.cueTimes.get(cue)
      if (!original) {
        original = { start: cue.startTime, end: cue.endTime }
        this.cueTimes.set(cue, original)
      }
      cue.startTime = Math.max(0, original.start + this.delay)
      cue.endTime = Math.max(cue.startTime + 0.001, original.end + this.delay)
    }
  }
  private renderText() {
    if (!this.textContent) return
    const cues = Array.from(this.track?.track.activeCues || []) as VTTCue[]
    if (cues.length === this.textCues.length && cues.every((cue, i) => cue === this.textCues[i]))
      return
    this.textCues = cues
    const content = document.createDocumentFragment()
    for (const cue of cues) {
      const line = document.createElement("div")
      line.append(cue.getCueAsHTML())
      content.append(line)
    }
    this.textContent.replaceChildren(content)
  }
  sync() {
    const external = this.events.burned() < 0 && this.visible && !this.video.seeking
    const tracks = Array.from(this.video.textTracks)
    const nativeTrack =
      tracks.find((track) => track !== this.track?.track && track.label === this.selected?.name) ||
      this.track?.track
    if (this.ass?.canvasParent)
      this.ass.canvasParent.style.visibility = external && !this.native && !this.assFallback ? "visible" : "hidden"
    if (this.canvas) this.canvas.style.visibility = external && !this.native ? "visible" : "hidden"
    if (this.textOverlay)
      this.textOverlay.style.visibility =
        external && !this.native &&
        (this.assFallback || !["ass","ssa","pgs"].includes(this.selected?.type||"")) &&
        (this.assFallback || this.appearance.subtitleStyling === "Custom")
          ? "visible"
          : "hidden"
    for (const track of tracks) {
      if (track.kind !== "subtitles" && track.kind !== "captions") continue
      const mode =
        external &&
        (this.native
          ? track === nativeTrack
          : (this.assFallback || !["ass", "ssa", "pgs"].includes(this.selected?.type || "")) &&
            track === this.track?.track)
          ? "showing"
          : "disabled"
      const actualMode =
        mode === "showing" &&
        !this.native &&
        this.textOverlay &&
        (this.assFallback || this.appearance.subtitleStyling === "Custom")
          ? "hidden"
          : mode
      if (track.mode !== actualMode) track.mode = actualMode
    }
    this.renderText()
  }
  resize() {
    this.ass?.resize()
    this.updateStyle()
  }
  dispose() {
    this.lifetime.abort()
    this.request?.abort()
    this.clear()
    this.css.remove()
  }
}
