import type { MediaTransport, PlaybackSource, PlayerState } from "./types"

/** Owns video lifecycle and the single media clock. Subtitles/danmaku cannot
 * hold this controller's ready state. All initial loads and switches use load(). */
export class PlaybackController {
  state: PlayerState = { phase: "idle", position: 0, duration: 0 }
  source?: PlaybackSource
  private operation?: AbortController
  private destroyed = false
  private intent = false
  intentVersion = 0
  seekVersion = 0
  private loading = false
  private negotiating = false
  private listeners = new Set<(state: PlayerState) => void>()
  private lifetime = new AbortController()
  private lastFrameAt?: number
  private frameProgressAt?: number
  private frame?: number
  private stallTimer?: ReturnType<typeof setTimeout>
  onDecodeError?: (error: Error) => Promise<boolean>

  constructor(
    readonly video: HTMLVideoElement,
    private transport: MediaTransport,
    private timeout = 30000,
  ) {
    const on = (name: string, fn: () => void) =>
      video.addEventListener(name, fn, { signal: this.lifetime.signal })
    on("playing", () => {
      if (video.paused) return
      this.frameProgressAt = Date.now()
      this.intent = true
      if (!this.loading && this.state.phase !== "error") this.publish("playing")
    })
    on("play", () => {
      if (video.paused) return
      if (this.negotiating && this.source) {
        this.intent = true
        video.pause()
        return
      }
      if (!this.loading && !this.intent) this.intentVersion++
      this.intent = true
      if (!this.loading && this.state.phase !== "error")
        this.publish(video.seeking ? "seeking" : video.readyState >= 2 ? "playing" : "buffering")
    })
    on("pause", () => {
      if (!video.paused) return
      if (!this.loading && this.state.phase !== "error") {
        if (this.intent) this.intentVersion++
        this.intent = false
        this.publish(video.seeking ? "seeking" : "paused")
      }
    })
    on("waiting", () => {
      if (!this.loading && this.intent && video.readyState < 3 && this.state.phase !== "error")
        this.publish(video.seeking ? "seeking" : "buffering")
    })
    on("seeking", () => {
      if (this.loading || this.state.phase === "error") return
      this.publish("seeking")
      this.seekVersion++
      this.transport.seek?.(this.position)
    })
    on("seeked", () => {
      if (!this.loading && this.state.phase !== "error")
        this.publish(video.seeking ? "seeking" : video.paused ? "paused" : "playing")
    })
    on("canplay", () => {
      if (!this.loading && this.state.phase !== "error")
        this.publish(video.seeking ? "seeking" : video.paused ? "paused" : "playing")
    })
    on("timeupdate", () => {
      // Some decoders keep the audio clock running while producing no image,
      // without a media error or waiting event. Recover from actual missing
      // presented frames, not from the codec name or a low frame-rate guess.
      // Native fullscreen/PiP draws outside the document. WebKit can suspend
      // webpage frame callbacks there while the system player is healthy.
      const presentation = (video as HTMLVideoElement & {webkitPresentationMode?: string; webkitDisplayingFullscreen?: boolean})
      const systemVideo = presentation.webkitDisplayingFullscreen ||
        ["fullscreen", "picture-in-picture"].includes(presentation.webkitPresentationMode || "") ||
        video.ownerDocument?.pictureInPictureElement === video
      if (
        typeof video.requestVideoFrameCallback === "function" &&
        !this.loading &&
        this.intent &&
        !video.paused &&
        !video.seeking &&
        !systemVideo &&
        this.state.phase !== "error" &&
        video.ownerDocument?.visibilityState !== "hidden"
      ) {
        const now = Date.now()
        this.frameProgressAt ??= now
        if (now - Math.max(this.frameProgressAt, this.lastFrameAt ?? 0) > 8000) {
          this.frameProgressAt = now
          void this.fail(new Error("浏览器未能输出视频画面"), true)
        }
      } else this.frameProgressAt = undefined
      if (!this.loading)
        this.publish(
          this.state.phase !== "error" && !video.paused && !video.seeking && video.readyState >= 3
            ? "playing"
            : this.state.phase,
        )
    })
    on("ended", () => {
      if (!video.ended) return
      this.intent = false
      this.publish("paused")
    })
    on("error", () => {
      if (!this.loading && video.error)
        void this.fail(
          new Error(video.error?.message || "视频无法播放"),
          [3, 4].includes(video.error?.code || 0),
        )
    })
    // WebKit can deliver decoded frames after a paused seek without emitting
    // another `playing` event. A presented frame is stronger evidence than
    // canplay/readyState; it does not create or adjust a second media clock.
    const frame = () => {
      if (this.destroyed) return
      this.lastFrameAt = Date.now()
      if (
        !this.loading &&
        !video.paused &&
        !video.seeking &&
        !["playing", "error"].includes(this.state.phase)
      )
        this.publish("playing")
      this.frame = video.requestVideoFrameCallback?.(frame)
    }
    const armFrames = () => {
      if (this.frame !== undefined) video.cancelVideoFrameCallback?.(this.frame)
      this.lastFrameAt = undefined
      this.frameProgressAt = undefined
      this.frame = video.requestVideoFrameCallback?.(frame)
    }
    // WebKit can cancel outstanding callbacks when load() replaces the source.
    on("loadedmetadata", armFrames)
    armFrames()
  }
  subscribe(listener: (state: PlayerState) => void) {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }
  get busy() {
    return this.loading
  }
  get playing() {
    return this.intent && !this.video.ended
  }
  get position() {
    return Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0
  }
  private publish(phase: PlayerState["phase"], error?: string, operation?: string) {
    if (this.destroyed && phase !== "disposed") return
    if (phase !== this.state.phase) {
      clearTimeout(this.stallTimer)
      this.stallTimer = undefined
      if (phase === "seeking" || phase === "buffering")
        this.stallTimer = setTimeout(() => {
          void this.fail(new Error("视频缓冲超时，请重试加载"))
        }, this.timeout * 2)
    }
    if (phase === "error" && !error) error = this.state.error
    this.state = {
      phase,
      position: this.position,
      duration: Number.isFinite(this.video.duration) ? this.video.duration : 0,
      ...(error ? { error } : {}),
      ...(operation ? { operation } : {}),
    }
    for (const listener of this.listeners) listener(this.state)
  }
  whenIdle(): Promise<void> {
    if (this.state.phase === "error") return Promise.reject(new Error(this.state.error))
    if (this.destroyed) return Promise.reject(new DOMException("播放器已关闭", "AbortError"))
    if (!this.loading) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const unsubscribe = this.subscribe((state) => {
        if (state.phase === "disposed" || state.phase === "error") {
          unsubscribe()
          reject(new Error(state.error || "播放已取消"))
        } else if (!this.loading) {
          unsubscribe()
          resolve()
        }
      })
    })
  }
  async play() {
    this.intentVersion++
    if (this.state.phase === "error") throw new Error(this.state.error || "请重试加载视频")
    this.intent = true
    if (this.loading) this.publish(this.state.phase)
    if (this.negotiating && this.source) return
    let started!: () => void
    const event = new Promise<void>((resolve) => {
      started = () => resolve()
      this.video.addEventListener("play", started, { once: true })
    })
    try {
      await Promise.race([this.video.play(), event])
    } catch (error) {
      if ((error as Error).name === "AbortError") return
      if ((error as Error).name === "NotAllowedError") {
        this.intent = false
        this.publish("paused")
      } else throw error
    } finally {
      this.video.removeEventListener("play", started)
    }
  }

  pause() {
    this.intentVersion++
    this.intent = false
    this.video.pause()
    if (this.state.phase !== "error")
      this.publish(this.loading ? this.state.phase : this.video.seeking ? "seeking" : "paused")
  }
  seek(position: number) {
    if (this.loading || !Number.isFinite(position) || !Number.isFinite(this.video.duration)) return
    this.video.currentTime = Math.max(0, Math.min(position, this.video.duration - 0.05))
  }
  /** A source is committed only after its own metadata and decoded data at the
   * target position arrive. A failed switch restores the still-authorized source. */
  async load(
    request: PlaybackSource | Promise<PlaybackSource>,
    position = 0,
    playing = this.intent,
    label = "播放",
  ) {
    if (this.destroyed) throw new DOMException("播放器已关闭", "AbortError")
    this.operation?.abort(new DOMException("播放请求已更新", "AbortError"))
    const operation = new AbortController()
    this.operation = operation
    const previous = this.source,
      previousPosition = this.position
    this.intent = playing
    this.loading = true
    this.negotiating = true
    this.publish(previous ? "switching" : "loading", undefined, label)
    // Freeze the captured position during negotiation. Otherwise the old video
    // keeps advancing and committing the new source visibly rewinds playback.
    if (previous) this.video.pause()
    let attached = false
    try {
      const source = await new Promise<PlaybackSource>((resolve, reject) => {
        const cancelled = () =>
          reject(operation.signal.reason || new DOMException("播放已取消", "AbortError"))
        operation.signal.addEventListener("abort", cancelled, { once: true })
        Promise.resolve(request).then(
          (source) => {
            operation.signal.removeEventListener("abort", cancelled)
            resolve(source)
          },
          (error) => {
            operation.signal.removeEventListener("abort", cancelled)
            reject(error)
          },
        )
      })
      if (operation.signal.aborted) throw operation.signal.reason
      this.negotiating = false
      attached = true
      await this.attach(source, position, operation.signal)
      if (operation.signal.aborted) throw operation.signal.reason
      this.source = source
      this.loading = false
      if (this.intent) await this.play()
      else this.video.pause()
      this.publish(this.video.paused ? "paused" : "playing")
    } catch (error) {
      if (operation.signal.aborted || this.destroyed) throw error
      this.negotiating = false
      if (previous) {
        try {
          if (attached) await this.attach(previous, previousPosition, operation.signal)
          this.source = previous
          this.loading = false
          if (this.intent) await this.play()
          this.publish(this.video.seeking ? "seeking" : this.video.paused ? "paused" : "playing")
        } catch {
          this.loading = false
          this.publish("error", "视频切换失败，原视频也未能恢复")
        }
      } else {
        this.loading = false
        this.publish("error", (error as Error).message || "视频加载失败")
      }
      throw error
    } finally {
      if (this.operation === operation) {
        this.operation = undefined
        this.loading = false
        this.negotiating = false
      }
    }
  }
  private attach(source: PlaybackSource, position: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let metadata = false,
        done = false,
        corrected = false
      let target = Math.max(0, Number.isFinite(position) ? position : 0)
      const events = ["loadeddata", "canplay", "seeked", "timeupdate"]
      const finish = (error?: unknown) => {
        if (done) return
        done = true
        clearTimeout(timer)
        for (const event of events) this.video.removeEventListener(event, inspect)
        this.video.removeEventListener("loadedmetadata", loaded)
        this.video.removeEventListener("error", failed)
        signal.removeEventListener("abort", aborted)
        error ? reject(error) : resolve()
      }
      const inspect = () => {
        if (!metadata || this.video.readyState < 2 || this.video.seeking) return
        if (Math.abs(this.position - target) > 1) {
          if (!corrected) {
            corrected = true
            try {
              this.video.currentTime = target
            } catch (error) {
              finish(error)
            }
          }
          return
        }
        finish()
      }
      const loaded = () => {
        metadata = true
        if (Number.isFinite(this.video.duration))
          target = Math.min(target, Math.max(0, this.video.duration - 0.05))
        // startPosition chooses the HLS fragments; currentTime must also move.
        // Waiting for canplay first deadlocks a paused resume outside buffer 0.
        if (Math.abs(this.position - target) > 1) {
          try {
            this.video.currentTime = target
          } catch (error) {
            finish(error)
          }
        }
        inspect()
      }
      const failed = () => finish(new Error(this.video.error?.message || "视频流加载失败"))
      const aborted = () => finish(signal.reason || new DOMException("播放已取消", "AbortError"))
      const timer = setTimeout(() => {
        const buffered = this.video.buffered
        const targetBuffered =
          buffered &&
          Array.from(
            { length: buffered.length },
            (_, i) => target >= buffered.start(i) && target < buffered.end(i),
          ).some(Boolean)
        finish(
          Object.assign(new Error("视频加载超时，请重试"), {
            decode: !!targetBuffered && this.video.readyState < 2,
          }),
        )
      }, this.timeout)
      for (const event of events) this.video.addEventListener(event, inspect)
      this.video.addEventListener("loadedmetadata", loaded)
      this.video.addEventListener("error", failed)
      signal.addEventListener("abort", aborted, { once: true })
      try {
        this.transport.attach(source, target, (error, decode) => {
          if (done) {
            if (!this.loading) void this.fail(error, decode)
          } else finish(Object.assign(error, { decode }))
        })
        if (this.intent)
          void this.video.play().catch((error) => {
            if (error.name === "NotAllowedError") this.intent = false
          })
      } catch (error) {
        finish(error)
      }
    })
  }
  async fail(error: Error, decode = false) {
    if (this.destroyed) return
    if (decode && this.onDecodeError)
      try {
        if (await this.onDecodeError(error)) return
      } catch {}
    this.video.pause()
    this.intent = false
    this.publish("error", error.message)
  }
  dispose() {
    if (this.destroyed) return
    this.destroyed = true
    this.operation?.abort()
    this.lifetime.abort()
    if (this.frame !== undefined) this.video.cancelVideoFrameCallback?.(this.frame)
    this.transport.dispose()
    this.video.pause()
    this.publish("disposed")
    this.listeners.clear()
  }
}
