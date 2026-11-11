import type { MediaTransport, PlaybackSource } from "./types"

export class BrowserTransport implements MediaTransport {
  private hls: any
  private errorHandler?: (error: Error, decode: boolean) => void
  private failures: string[] = []
  private clearSeek?: () => void
  private seekRecoveries = 0
  private timelineOffset = 0
  usesMse = false
  get diagnostic() {
    return {
      mse: this.usesMse,
      width: this.video.videoWidth,
      height: this.video.videoHeight,
      levels: this.hls?.levels?.map((l: any) => ({
        videoCodec: l.videoCodec,
        audioCodec: l.audioCodec,
      })),
      errors: this.failures,
      bufferSeconds: this.hls?.config?.maxBufferLength,
      seekRecoveries: this.seekRecoveries,
      timelineOffset: this.timelineOffset,
      buffered: Array.from({ length: this.video.buffered.length }, (_, i) => [
        this.video.buffered.start(i),
        this.video.buffered.end(i),
      ]),
    }
  }
  constructor(
    private video: HTMLVideoElement,
    private Hls: any,
    private mode: "mse" | "native" = "mse",
    private highBitrateBuffer: 6 | 30 = 30,
  ) {}
  seek(position: number) {
    this.clearSeek?.()
    if (!this.hls) return
    const buffered = () =>
      Array.from({ length: this.video.buffered.length }, (_, index) => [
        this.video.buffered.start(index),
        this.video.buffered.end(index),
      ]).some(([start, end]) => position >= start && position < end)
    // Restart loading on an unbuffered seek; also detect decoders that accept
    // bytes into MSE but never deliver a frame at the requested position.
    const hls = this.hls
    const playable = () => buffered() && this.video.readyState >= 2 && !this.video.seeking
    if (playable()) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      clearTimeout(timer)
      hls.off(this.Hls.Events.FRAG_BUFFERED, inspect)
      this.video.removeEventListener?.("seeked", completed)
      this.video.removeEventListener?.("loadeddata", completed)
      if (this.clearSeek === clear) this.clearSeek = undefined
    }
    const completed = () => {
      if (playable()) clear()
    }
    const schedule = () => {
      if (timer) return
      timer = setTimeout(
        () => {
          const ready = playable()
          clear()
          if (!ready && Math.abs(this.video.currentTime - position) < 1) {
            this.seekRecoveries++
            this.errorHandler?.(new Error("浏览器未能解码目标视频片段"), true)
          }
        },
        buffered() ? 3000 : 750,
      )
    }
    const inspect = (_event: unknown, data: any) => {
      if (playable()) {
        clear()
        return
      }
      if (data.frag?.type === "main" && data.frag.start <= position && data.frag.end > position)
        schedule()
    }
    this.clearSeek = clear
    this.video.addEventListener?.("seeked", completed)
    this.video.addEventListener?.("loadeddata", completed)
    hls.on(this.Hls.Events.FRAG_BUFFERED, inspect)
    if (buffered()) schedule()
    else hls.startLoad(position, true)
  }

  attach(
    source: PlaybackSource,
    position: number,
    onError: (error: Error, decode: boolean) => void,
  ) {
    this.dispose()
    this.failures = []
    this.timelineOffset = 0
    this.errorHandler = onError
    this.video.removeAttribute("src")
    this.video.load()
    this.usesMse =
      ["m3u8", "m3u"].includes(source.mediaType) && this.mode === "mse" && this.Hls?.isSupported()
    if (this.usesMse) {
      const buffer = (source.maxStreamingBitrate || 0) >= 25000000 ? this.highBitrateBuffer : 30
      this.hls = new this.Hls({
        startPosition: position,
        lowLatencyMode: false,
        backBufferLength: Infinity,
        liveBackBufferLength: 90,
        manifestLoadingTimeOut: 20000,
        // A discontinuous seek can restart Jellyfin's encoder. Its measured
        // cold preroll is ~41 s; HLS's 20 s default aborts that valid work.
        // Keep this below the controller's 60 s buffering deadline.
        fragLoadingTimeOut: 45000,
        maxBufferLength: buffer,
        maxMaxBufferLength: buffer,
        videoPreference: { preferHDR: true },
      })
      const hls = this.hls
      let timelineFailed = false
      hls.on(this.Hls.Events.INIT_PTS_FOUND, (_: unknown, data: any) => {
        if (data.id !== "main" || !data.frag?.initSegment) return
        const offset = Number(data.initPTS) / Number(data.timescale)
        if (!Number.isFinite(offset)) return
        this.timelineOffset = offset
        // Jellyfin can emit a muxed fMP4 fragment several seconds before its
        // advertised EXTINF position. HLS then shifts the image while external
        // subtitles retain the real media time. Do not compensate captions or
        // invent a second clock: request Jellyfin's supported TS fallback.
        if (!timelineFailed && Math.abs(offset) > 1) {
          timelineFailed = true
          queueMicrotask(() => {
            if (this.hls !== hls) return
            hls.stopLoad()
            this.errorHandler?.(new Error("视频片段时间戳与播放时间不一致"), true)
          })
        }
      })
      this.hls.on(this.Hls.Events.ERROR, (_: unknown, error: any) => {
        this.failures.push(String(error.details))
        this.failures = this.failures.slice(-8)
        if (error.fatal)
          this.errorHandler?.(
            new Error(
              error.type === this.Hls.ErrorTypes.NETWORK_ERROR
                ? "视频网络请求失败"
                : "视频解码失败",
            ),
            error.type === this.Hls.ErrorTypes.MEDIA_ERROR,
          )
      })
      this.hls.loadSource(source.url)
      this.hls.attachMedia(this.video)
    } else {
      this.video.src = source.url + (position >= 1 ? `#t=${position}` : "")
      this.video.load()
    }
  }
  dispose() {
    this.clearSeek?.()
    this.hls?.destroy()
    this.hls = undefined
    this.errorHandler = undefined
    this.usesMse = false
  }
}
