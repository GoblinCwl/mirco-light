export const settingIcon = (name: string) => {
  const paths: Record<string, string> = {
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    setting: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
    volume: '<path d="M4 9h4l5-4v14l-5-4H4V9Zm12 0a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/>',
    volumeClose: '<path d="M4 9h4l5-4v14l-5-4H4V9Zm12 1 5 5m0-5-5 5"/>',
    fullscreenOn: '<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>',
    fullscreenOff: '<path d="M9 4v5H4m11-5v5h5M4 15h5v5m6 0v-5h5"/>',
    fullscreenWebOn:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18m-6 4h3v5m-6 0h6"/>',
    fullscreenWebOff:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M18 12h-6v5m0 0h6"/>',
    pip: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11" y="11" width="7" height="6" rx="1"/>',
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
  return `<svg class="quartz-setting-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.subtitles}</svg>`
}

export const playerIcons = {
  close: settingIcon("close"),
  setting: settingIcon("setting"),
  volume: settingIcon("volume"),
  volumeClose: settingIcon("volumeClose"),
  fullscreenOn: settingIcon("fullscreenOn"),
  fullscreenOff: settingIcon("fullscreenOff"),
  fullscreenWebOn: settingIcon("fullscreenWebOn"),
  fullscreenWebOff: settingIcon("fullscreenWebOff"),
  pip: settingIcon("pip"),
  loading: '<span class="quartz-buffering" role="status" aria-label="视频加载中"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="quartz-buffering-track" cx="20" cy="20" r="15"/><path class="quartz-buffering-orbit" d="M20 5a15 15 0 0 1 15 15"/><path class="quartz-buffering-star" d="m20 13 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/></svg></span>',
  state: '<svg class="quartz-transport-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5 19 12 8 18.5Z"/></svg>',
  play: '<svg class="quartz-transport-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5 19 12 8 18.5Z"/></svg>',
  pause: '<svg class="quartz-transport-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="5" width="3" height="14" rx=".8"/><rect x="14" y="5" width="3" height="14" rx=".8"/></svg>',
}
