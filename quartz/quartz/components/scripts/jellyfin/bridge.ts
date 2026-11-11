import type { PlaybackSource } from "./types"

/** The isolated frame never sees credentials. Only its parent may supply
 * authorized playback URLs or the allow-listed static renderer assets. */
export class PlayerBridge {
  private lifetime = new AbortController()
  private assets = new Map<string, Promise<ArrayBuffer>>()
  private pendingAssets = new Map<
    string,
    {
      resolve: (value: ArrayBuffer) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private pending?: {
    resolve: (value: PlaybackSource) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
  private initialResolve!: (value: PlaybackSource) => void
  private initialReject!: (error: Error) => void
  readonly initial = new Promise<PlaybackSource>((resolve, reject) => {
    this.initialResolve = resolve
    this.initialReject = reject
  })
  onError?: (message: string) => void
  constructor(readonly channel: string) {
    void this.initial.catch(() => {})
    addEventListener(
      "message",
      (event) => {
        if (event.source !== parent || event.data?.channel !== channel) return
        const data = event.data
        if (data.type === "videoStart") {
          this.initialResolve({ ...data, mediaType: data.mediaType || "m3u8" })
          return
        }
        if (data.type === "jellyfinSource") {
          if (this.pending) {
            const pending = this.pending
            this.pending = undefined
            clearTimeout(pending.timer)
            pending.resolve(data)
          } else this.ack(data, false)
        }
        if (["jellyfinPlaybackError", "jellyfinQualityError"].includes(data.type)) {
          const error = new Error(data.message || "播放请求失败，请重试")
          if (this.pending) {
            clearTimeout(this.pending.timer)
            this.pending.reject(error)
            this.pending = undefined
          } else {
            this.initialReject(error)
            this.onError?.(error.message)
          }
        }
        if (["subtitleAssetResult", "playerAssetResult"].includes(data.type)) {
          const key = data.type + ":" + data.name,
            pending = this.pendingAssets.get(key)
          if (!pending) return
          this.pendingAssets.delete(key)
          clearTimeout(pending.timer)
          data.buffer instanceof ArrayBuffer
            ? pending.resolve(data.buffer)
            : pending.reject(new Error(data.error || "播放器资源加载失败"))
        }
      },
      { signal: this.lifetime.signal },
    )
  }
  send(type: string, fields: Record<string, unknown> = {}) {
    parent.postMessage({ channel: this.channel, type, ...fields }, "*")
  }
  ready() {
    this.send("ready")
  }
  asset(name: string, kind: "player" | "subtitle" = "subtitle"): Promise<ArrayBuffer> {
    const key = kind + "AssetResult:" + name
    let promise = this.assets.get(key)
    if (!promise) {
      promise = new Promise<ArrayBuffer>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingAssets.delete(key)
          reject(new Error("播放器资源加载超时"))
        }, 45000)
        this.pendingAssets.set(key, { resolve, reject, timer })
        this.send(kind + "Asset", { name })
      }).catch((error) => {
        this.assets.delete(key)
        throw error
      })
      this.assets.set(key, promise)
    }
    return promise
  }
  change(type: string, fields: Record<string, unknown> = {}): Promise<PlaybackSource> {
    if (this.pending) return Promise.reject(new Error("正在切换，请稍候"))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined
        reject(new Error("播放协商超时"))
      }, 80000)
      this.pending = { resolve, reject, timer }
      this.send(type, fields)
    })
  }
  ack(source: PlaybackSource, success: boolean) {
    if (source.requestId !== undefined)
      this.send(success ? "jellyfinSourceReady" : "jellyfinSourceFailed", {
        requestId: source.requestId,
      })
  }
  dispose() {
    this.lifetime.abort()
    const error = new DOMException("播放器已关闭", "AbortError")
    this.initialReject(error)
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(error)
      this.pending = undefined
    }
    for (const value of this.pendingAssets.values()) {
      clearTimeout(value.timer)
      value.reject(error)
    }
    this.pendingAssets.clear()
  }
}
