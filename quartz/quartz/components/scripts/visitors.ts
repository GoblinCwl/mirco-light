import {waitForVisitorRecord} from './visitorRecording'
import { visitorHeaders, ownMeteorId } from "./visitorIdentity"
import { setupVisitorDetails } from "./visitorDetails"
import { createVisitorCanvas } from "./visitorCanvas"

type Meteor = { id: string; arrivedOn: string; region?: string | null }
type VisitorSummary = { total: number; today: number; meteors: Meteor[]; isNew?: boolean; meteorId?: string }



export function setupVisitorSky() {
  const panel = document.querySelector<HTMLElement>("[data-home-visitors]")
  if (!panel) return
  const controller = new AbortController()
  const sky = panel.querySelector<HTMLElement>("[data-visitor-sky]")!
  const status = panel.querySelector<HTMLElement>("[data-visitor-status]")!
  const range = panel.querySelector<HTMLElement>("[data-visitors-range]")!
  const previous = panel.querySelector<HTMLButtonElement>("[data-visitors-prev]")!
  const next = panel.querySelector<HTMLButtonElement>("[data-visitors-next]")!
  const ranges = [{ days: 7, label: "近7日" }, { days: 30, label: "近30日" }, { days: 365, label: "近1年" }]
  let rangeIndex = 1
  let transitions: Animation[] = []
  let departingSky: ReturnType<typeof createVisitorCanvas> | undefined
  let currentSky: ReturnType<typeof createVisitorCanvas> | undefined
  const cancelTransitions = () => {
    transitions.forEach(animation => animation.cancel())
    transitions = []
    departingSky?.canvas.remove()
    departingSky?.dispose()
    departingSky = undefined
  }
  const requestSignal = () => AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])
  let requestVersion = 0
  let rangeInitialized = false
  let currentData: VisitorSummary | undefined
  setupVisitorDetails()
  let drawFrame = 0
  let visible = true
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  const epoch = performance.now()
  let previousSize = ""
  const draw = (retainPrevious = false) => {
    if (!currentData || !panel.isConnected || controller.signal.aborted) return
    const width = Math.max(1, sky.clientWidth), height = Math.max(1, sky.clientHeight)
    previousSize = `${width}:${height}`
    const next = createVisitorCanvas({ data: currentData, width, height, epoch, ownId: ownMeteorId(), reducedMotion: reducedMotion.matches,
      visible: () => visible && !document.documentElement.hasAttribute("data-graph-expanded") })
    if (!retainPrevious) currentSky?.dispose()
    currentSky = next
    sky.replaceChildren(next.canvas, next.tooltip)
  }
  const render = (data: VisitorSummary, retainPrevious = false) => {
    if (!panel.isConnected || controller.signal.aborted) return
    if (!Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.today) || !Array.isArray(data.meteors)) throw new Error("Invalid visitor statistics")
    panel.querySelector("[data-visitors-total]")!.textContent = String(data.total)
    panel.querySelector("[data-visitors-today]")!.textContent = String(data.today)
    status.textContent = ""
    status.hidden = true
    panel.dataset.loaded = "true"
    currentData = data
    draw(retainPrevious)
  }
  const observer = new ResizeObserver(() => {
    const size = `${sky.clientWidth}:${sky.clientHeight}`
    if (size === previousSize) return
    previousSize = size
    cancelAnimationFrame(drawFrame)
    drawFrame = requestAnimationFrame(() => draw())
  })
  observer.observe(sky)
  const visibility = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true })
  visibility.observe(sky)
  const motionChanged = () => draw()
  reducedMotion.addEventListener("change", motionChanged)
  window.addCleanup(() => { controller.abort(); observer.disconnect(); visibility.disconnect(); reducedMotion.removeEventListener("change", motionChanged); previous.removeEventListener("click", goPrevious); next.removeEventListener("click", goNext); cancelTransitions(); cancelAnimationFrame(drawFrame); currentSky?.dispose() })
  const flowBetween = (oldSky: ReturnType<typeof createVisitorCanvas> | undefined, direction: number) => {
    if (reducedMotion.matches || !currentSky) return
    const canvas = currentSky.canvas
    const timing = { duration: 900, easing: "cubic-bezier(.22, .61, .36, 1)" }
    if (oldSky) {
      departingSky = oldSky
      oldSky.canvas.setAttribute("aria-hidden", "true")
      oldSky.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none"
      sky.prepend(oldSky.canvas)
      const exit = oldSky.canvas.animate([
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: `translateX(${-direction * 16}px)` },
      ], { ...timing, fill: "forwards" })
      transitions.push(exit)
      void exit.finished.then(() => {
        oldSky.canvas.remove(); oldSky.dispose()
        if (departingSky === oldSky) departingSky = undefined
      }).catch(() => {})
    }
    transitions.push(canvas.animate([
      { opacity: 0, transform: `translateX(${direction * 16}px)` },
      { opacity: 1, transform: "translateX(0)" },
    ], timing))
  }
  const read = async (direction = 0) => {
    const version = ++requestVersion
    sky.setAttribute("aria-busy", "true")
    try {
      const response = await fetch(`/api/visitors?days=${ranges[rangeIndex].days}`, { signal: requestSignal(), credentials: "omit", cache: "no-store", headers: visitorHeaders() })
      if (!response.ok) throw new Error("Visitor statistics unavailable")
      const data = await response.json()
      if (version !== requestVersion || controller.signal.aborted) return
      if (!rangeInitialized && data.meteors.length < 50 && rangeIndex < ranges.length - 1) {
        rangeIndex++
        range.textContent = ranges[rangeIndex].label
        previous.disabled = rangeIndex === 0
        next.disabled = rangeIndex === ranges.length - 1
        void read()
        return
      }
      rangeInitialized = true
      cancelTransitions()
      const oldSky = direction && !reducedMotion.matches
        ? currentSky
        : undefined
      render(data, Boolean(oldSky))
      if (direction) flowBetween(oldSky, direction)
    } catch {
      if (version === requestVersion && !controller.signal.aborted) {
        cancelTransitions()
        status.hidden = false
        status.textContent = "来访星空暂不可用，请重新切换"
      }
    } finally { if (version === requestVersion) { sky.setAttribute("aria-busy", "false"); delete panel.dataset.homePending; panel.setAttribute("aria-busy", "false") } }
  }
  const changeRange = (step: number) => {
    rangeIndex = Math.max(0, Math.min(ranges.length - 1, rangeIndex + step))
    range.textContent = ranges[rangeIndex].label
    previous.disabled = rangeIndex === 0
    next.disabled = rangeIndex === ranges.length - 1
    void read(step)
  }
  const goPrevious = () => changeRange(-1)
  const goNext = () => changeRange(1)
  previous.addEventListener("click", goPrevious)
  next.addEventListener("click", goNext)
  // Navigation starts the recorder in the same event turn. Wait briefly before
  // the first summary so visitor-recorded does not trigger a redundant read.
  let initialReadPending=true,recordChangedDuringRead=false
  const visitRecorded=()=>{if(initialReadPending){recordChangedDuringRead=true;return};void read()}
  document.addEventListener("visitor-recorded",visitRecorded)
  window.addCleanup(()=>document.removeEventListener("visitor-recorded",visitRecorded))
  queueMicrotask(()=>{void (async()=>{
    await waitForVisitorRecord()
    recordChangedDuringRead=false
    if(!controller.signal.aborted)await read()
    initialReadPending=false
    if(recordChangedDuringRead&&!controller.signal.aborted)void read()
  })()})
}
