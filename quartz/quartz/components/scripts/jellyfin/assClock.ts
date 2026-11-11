/** Rebase libass at media discontinuities. Its built-in seek listener stops
 * timeupdate without pausing the worker, so buffering can leave its extrapolated
 * clock running. All timestamps here come from the video, never a second clock. */
export function mountAssClock(
  video: HTMLVideoElement,
  renderer: {
    setIsPaused: (paused: boolean, time: number) => void
    setRate: (rate: number) => void
  },
  signal: AbortSignal,
  delay: () => number,
) {
  let waiting = false
  const sync = (time = video.currentTime) => {
    if (signal.aborted || !Number.isFinite(video.currentTime)) return
    renderer.setIsPaused(
      waiting || video.seeking || video.paused || video.readyState < 2,
      time - delay(),
    )
  }
  const on = (name: string, fn: () => void) => video.addEventListener(name, fn, { signal })
  on("seeking", () => {
    waiting = true
    sync()
  })
  on("waiting", () => {
    waiting = true
    sync()
  })
  for (const name of ["seeked", "playing", "canplay", "loadedmetadata"])
    on(name, () => {
      waiting = false
      sync()
    })
  on("pause", () => sync())
  on("timeupdate", () => sync())
  on("ratechange", () => {
    renderer.setRate(video.playbackRate)
    sync()
  })
  renderer.setRate(video.playbackRate || 1)
  sync()
  // Use the timestamp of the frame actually presented by the decoder. During
  // a seek currentTime can already point at the destination while the old
  // frame is still on screen. Older browsers retain the media-event path.
  let frame: number | undefined
  const presented: VideoFrameRequestCallback = (_now, metadata) => {
    if (signal.aborted) return
    if (!video.seeking) sync(metadata.mediaTime)
    frame = video.requestVideoFrameCallback(presented)
  }
  if (typeof video.requestVideoFrameCallback === "function") {
    frame = video.requestVideoFrameCallback(presented)
    signal.addEventListener(
      "abort",
      () => {
        if (frame !== undefined) video.cancelVideoFrameCallback(frame)
      },
      { once: true },
    )
  }
  return sync
}
