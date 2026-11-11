import type { VideoPreferences } from "../driveVideoPreferences"
export type SandboxPreview = {
  key: string
  url: string
  name: string
  size: number
  channel: string
  theme: string
  staticBase: string
  colors: {
    background: string
    foreground: string
    muted: string
    accent: string
    border: string
  }
  encoding?: string
  autoplay?: boolean
  cover?: string
  mediaShare?: boolean
  qualities?: {
    html: string
    url: string
  }[]
  matroskaReader?: string
  preferences?: VideoPreferences
  playerIcons?: Record<string,string>
  resumeTime?: number
  mediaType?: string
  videoAspectRatio?: number
  subtitleUrl?: string
  jellyfin?: {
    hlsMode?: "mse" | "native"
    highBitrateBuffer?: 6 | 30
    pgsRender?: boolean
    initialSubtitleIndex?: number
    defaultSubtitleStreamIndex?: number
    qualities: {
      id: string
      name: string
      bitrate: number
    }[]
    quality?: string
    audioTracks: {
      index: number
      key?: string
      name: string
    }[]
    audioStreamIndex?: number
  }
  episodes?: {
    previous?: {
      name: string
      url: string
    }
    next?: {
      name: string
      url: string
    }
  }
  danmuApi?: boolean
  danmu?: string
  currentAudio?: number
  playlist?: {
    name: string
    artist: string
    url: string
    cover?: string
    lrc?: string
  }[]
  subtitles?: {
    name: string
    url: string
    type: string
  }[]
  timeline?: {
    duration: number
    segments: {
      start: number
      end: number
      type: string
      text: string
    }[]
    chapters: {
      time: number
      text: string
    }[]
  }
  nativeSubtitles?: {
    index?: number
    key?: string
    name: string
    language: string
    type: string
    url: string
    nativeUrl?: string
    isDefault?: boolean
    burn?: boolean
  }[]
}
