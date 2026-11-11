/** Shared by Jellyfin and the serialized ordinary preview. Keep self-contained. */
export function mountPlayerFullscreen(
  player: any,
  options: {
    signal?: AbortSignal
    onError: (message: string) => void
    beforeNativeVideo?: () => void
    changed?: () => void
    webChanged?: (active: boolean) => void
  },
) {
  const element = player.template.$player as HTMLElement
  const video = player.template.$video as HTMLVideoElement
  // Reparenting an active fullscreen node makes the browser exit fullscreen.
  player.constructor.FULLSCREEN_WEB_IN_BODY = false
  const lifetime = new AbortController()
  let returnToWeb = false,
    busy = false
  const isNative = () => {
    const full = document.fullscreenElement || (document as any).webkitFullscreenElement
    return (
      full === element ||
      full === video ||
      !!(video as any).webkitDisplayingFullscreen ||
      (video as any).webkitPresentationMode === "fullscreen"
    )
  }
  const webChanged = () => options.webChanged?.(!!player.fullscreenWeb || returnToWeb)
  player.on("fullscreenWeb", webChanged)
  lifetime.signal.addEventListener("abort", () => player.off("fullscreenWeb", webChanged), {
    once: true,
  })
  let lastNative = isNative()
  const sync = (event?:Event) => {
    if (lifetime.signal.aborted) return
    const active = event?.type==="webkitendfullscreen" ? false : event?.type==="webkitbeginfullscreen" ? true : isNative()
    if (active === lastNative) return
    lastNative = active
    if (active && player.fullscreenWeb) {
      returnToWeb = true
      player.fullscreenWeb = false
    }
    element.classList.toggle("art-fullscreen", active)
    player.emit("fullscreen", active)
    if (!active) {
      const restore = returnToWeb
      returnToWeb = false
      // Let ArtPlayer finish its fullscreenchange handler before restoring web mode.
      queueMicrotask(() => {
        if (lifetime.signal.aborted) return
        if (restore) player.fullscreenWeb = true
        options.changed?.()
      })
    } else options.changed?.()
  }
  const leaveNative = async (web = false) => {
    if (busy) return
    busy = true
    if (web) {
      returnToWeb = true
      webChanged()
    }
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
      else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen)
        (document as any).webkitExitFullscreen()
      else if ((video as any).webkitExitFullscreen) (video as any).webkitExitFullscreen()
      else throw Error("unsupported")
      sync()
    } catch {
      if (!lifetime.signal.aborted) options.onError("无法退出系统全屏，请使用系统返回或退出键")
    } finally {
      busy = false
    }
  }
  const toggleNative = async () => {
    if (busy || lifetime.signal.aborted) return
    if (isNative()) {
      await leaveNative()
      return
    }
    busy = true
    returnToWeb = !!player.fullscreenWeb
    try {
      if (document.fullscreenEnabled && element.requestFullscreen) await element.requestFullscreen()
      else if (
        (document as any).webkitFullscreenEnabled &&
        (element as any).webkitRequestFullscreen
      )
        (element as any).webkitRequestFullscreen()
      else if ((video as any).webkitEnterFullscreen) {
        options.beforeNativeVideo?.()
        ;(video as any).webkitEnterFullscreen()
      } else throw Error("unsupported")
      sync()
    } catch {
      if (lifetime.signal.aborted) return
      if (returnToWeb && !player.fullscreenWeb) player.fullscreenWeb = true
      returnToWeb = false
      options.onError("无法进入系统全屏")
    } finally {
      busy = false
    }
  }
  const toggleWeb = async () => {
    if (busy || lifetime.signal.aborted) return
    if (isNative()) await leaveNative(true)
    else player.fullscreenWeb = !player.fullscreenWeb
  }
  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return
      const control = event.target.closest(".art-control-fullscreen,.art-control-fullscreenWeb")
      if (!control || !element.contains(control)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void (control.classList.contains("art-control-fullscreen") ? toggleNative() : toggleWeb())
    },
    { capture: true, signal: lifetime.signal },
  )
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !busy && !isNative() && player.fullscreenWeb) {
        event.preventDefault()
        event.stopImmediatePropagation()
        player.fullscreenWeb = false
      }
    },
    { capture: true, signal: lifetime.signal },
  )
  for (const event of ["fullscreenchange", "webkitfullscreenchange"])
    document.addEventListener(event, sync, { signal: lifetime.signal })
  for (const event of [
    "webkitbeginfullscreen",
    "webkitendfullscreen",
    "webkitpresentationmodechanged",
  ])
    video.addEventListener(event, sync, { signal: lifetime.signal })
  const dispose = () => lifetime.abort()
  if (options.signal?.aborted) dispose()
  else options.signal?.addEventListener("abort", dispose, { once: true })
  addEventListener("pagehide", dispose, { once: true, signal: lifetime.signal })
  return { toggleNative, toggleWeb, dispose }
}
