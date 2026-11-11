import type { SandboxPreview } from "../preview/sandboxTypes"

export type PlayerConfig = SandboxPreview & { jellyfin: NonNullable<SandboxPreview["jellyfin"]> }
export type SubtitleTrack = NonNullable<SandboxPreview["nativeSubtitles"]>[number]
export type PlaybackSource = {
  url: string
  mediaType: string
  playMethod?: string
  maxStreamingBitrate?: number
  subtitleStreamIndex?: number
  quality?: string
  audioStreamIndex?: number
  requestId?: number
  selection?: string
  position?: number
}
export type PlayerPhase =
  | "idle"
  | "loading"
  | "switching"
  | "playing"
  | "paused"
  | "buffering"
  | "seeking"
  | "error"
  | "disposed"
export type PlayerState = {
  phase: PlayerPhase
  position: number
  duration: number
  error?: string
  operation?: string
}
export interface MediaTransport {
  attach(
    source: PlaybackSource,
    position: number,
    onError: (error: Error, decode: boolean) => void,
  ): void
  dispose(): void
  seek?(position: number): void
  readonly usesMse: boolean
}
