import {waitForVisitorRecord} from './visitorRecording'
import { visitorHeaders, ownMeteorId } from "./visitorIdentity"
import { setupVisitorDetails } from "./visitorDetails"

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
  let departingSky: SVGElement | undefined
  const cancelTransitions = () => {
    transitions.forEach(animation => animation.cancel())
    transitions = []
    departingSky?.remove()
    departingSky = undefined
  }
  const requestSignal = () => AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])
  let requestVersion = 0
  let rangeInitialized = false
  const ns = "http://www.w3.org/2000/svg"
  const svgElement = (tag: string, attributes: Record<string, string>) => {
    const node = document.createElementNS(ns, tag)
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
    return node
  }
  let currentData: VisitorSummary | undefined
  setupVisitorDetails()
  let drawFrame = 0
  let orbitFrame = 0
  let visible = true
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  const epoch = performance.now()
  let previousSize = ""
  const draw = () => {
    if (!currentData || !panel.isConnected || controller.signal.aborted) return
    const data = currentData
    const width = Math.max(1, sky.clientWidth), height = Math.max(1, sky.clientHeight)
    previousSize = `${sky.clientWidth}:${sky.clientHeight}`
    const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": "每颗彗星代表一个独立浏览器的来访" })
    const defs = svgElement("defs", {})
    svg.append(defs)
    const tooltip = document.createElement("div")
    tooltip.className = "home-visitor-tooltip"
    tooltip.hidden = true
    tooltip.setAttribute("role", "status")
    const placeTooltip = (event: PointerEvent) => {
      const bounds = sky.getBoundingClientRect()
      const x = Math.max(8, Math.min(bounds.width - 8, event.clientX - bounds.left))
      const y = Math.max(8, Math.min(bounds.height - 8, event.clientY - bounds.top))
      tooltip.style.left = `${x}px`
      tooltip.style.top = `${y}px`
      tooltip.dataset.side = x > bounds.width * .62 ? "left" : "right"
    }
    const colors = ["#75aabd", "#a58abc", "#80ad9c", "#bea06b", "#839fbe"]
    // The visitor's own comet always renders at the largest size tier.
    const MAX_BASE_RADIUS = 0.9 + 3.8 + 1.1
    const OWN_RADIUS = MAX_BASE_RADIUS * 1.55 + 0.5
    const arrivalTimes = data.meteors.map(meteor => Date.parse(meteor.arrivedOn)).filter(Number.isFinite)
    const earliest = Math.min(...arrivalTimes), latest = Math.max(...arrivalTimes)
    // Sparse skies stay intimate and legible; dense skies retain their full depth.
    const count = Math.min(500, data.meteors.length)
    const sparse = Math.max(0, 1 - (count - 1) / 15)
    const bodies: { group: SVGElement; trails: SVGElement[]; head: SVGElement; phase: number; period: number; rx: number; ry: number; tilt: number; radius: number; offsetX: number; offsetY: number }[] = []
    for (const meteor of data.meteors.slice(0, 500)) {
      if (!/^[a-f\d]{24}$/.test(meteor.id) || !/^\d{4}-\d{2}-\d{2}$/.test(meteor.arrivedOn)) continue
      let seed = parseInt(meteor.id.slice(0, 8), 16) || 1
      const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 }
      const arrival = Date.parse(meteor.arrivedOn)
      const recency = latest > earliest ? Math.max(0, Math.min(1, (arrival - earliest) / (latest - earliest))) : 1
      const own = (data.meteorId ?? ownMeteorId()) === meteor.id
      const baseRadius = 0.9 + recency ** 1.8 * 3.8 + sparse * 1.1
      const radius = own ? OWN_RADIUS : baseRadius
      const color = own ? "#83d9ff" : colors[Math.floor(random() * colors.length)]
      const family = Math.floor(random() * 4)
      const rx = width * (.27 + family * .045 + random() * .025) * (1 - sparse * .32)
      const ry = height * (.12 + family * .045 + random() * .025) * (1 - sparse * .15)
      const tilt = (-26 + family * 14) * Math.PI / 180
      const group = svgElement("g", { class: "visitor-comet" })
      if (own) group.classList.add("is-own")
      const label = `${own ? "你的彗星 · " : ""}${meteor.region || "未知区域"} · ${meteor.arrivedOn}`
      group.setAttribute("aria-label", label)
      const trails: SVGElement[] = []
      for (let i = 0; i < (own ? 14 : 7); i++) {
        const trail = svgElement("path", { fill: "none", stroke: own && i % 2 ? "#e5c274" : color, "stroke-linecap": "round" })
        trails.push(trail)
        group.append(trail)
      }
      const haloId = `visitor-halo-${meteor.id}`
      const halo = svgElement("radialGradient", { id: haloId })
      halo.append(svgElement("stop", { offset: "0", "stop-color": "#f5fdff", "stop-opacity": own ? ".72" : ".6" }), svgElement("stop", { offset: ".3", "stop-color": color, "stop-opacity": own ? ".28" : ".35" }), svgElement("stop", { offset: ".7", "stop-color": color, "stop-opacity": own ? ".06" : ".1" }), svgElement("stop", { offset: "1", "stop-color": color, "stop-opacity": "0" }))
      defs.append(halo)
      const head = svgElement("g", {})
      const hit = svgElement("circle", { r: own ? "44" : "20", fill: "transparent", "pointer-events": "all" })
      head.append(svgElement("circle", { r: String(radius * (own ? 2.35 : 4)), fill: `url(#${haloId})` }),
        svgElement("circle", { r: String(radius), fill: color }),
        svgElement("circle", { r: String(radius * (own ? .5 : .43)), fill: "#f4faff", opacity: ".98" }),
        hit)
      if (own) {
        const ring = svgElement("g", { class: "visitor-own-ring", "pointer-events": "none" })
        ring.append(
          svgElement("ellipse", { cx: "0", cy: "0", rx: String(radius * 2.35), ry: String(radius * .58), fill: "none", stroke: "#e5c274", "stroke-width": ".9", transform: "rotate(35)" }),
          svgElement("ellipse", { cx: "0", cy: "0", rx: String(radius * 2.35), ry: String(radius * .58), fill: "none", stroke: "#e5c274", "stroke-width": ".9", opacity: ".72", transform: "rotate(-35)" }),
        )
        head.append(ring)
      }
      hit.addEventListener("pointerenter", event => {
        tooltip.textContent = label
        tooltip.dataset.own = own ? "true" : "false"
        tooltip.hidden = false
        placeTooltip(event)
      })
      hit.addEventListener("pointermove", placeTooltip)
      hit.addEventListener("pointerleave", () => { tooltip.hidden = true })
      group.append(head)
      svg.append(group)
      const randomPhase = random() * Math.PI * 2
      const phase = sparse > 0 ? bodies.length / Math.max(1, count) * Math.PI * 2 + randomPhase * .18 : randomPhase
      bodies.push({ group, trails, head, phase, period: 35 + random() * 90, rx, ry, tilt, radius,
        offsetX: (random() - .5) * width * .08, offsetY: (random() - .5) * height * .12 })
    }
    // SVG uses DOM order for painting and hit testing. Keep the owner's entire
    // comet (including its larger hover target) above every other comet.
    const ownGroup = svg.querySelector(".visitor-comet.is-own")
    if (ownGroup) svg.append(ownGroup)
    const position = (body: typeof bodies[number], angle: number) => {
      const x = Math.cos(angle) * body.rx, y = Math.sin(angle) * body.ry
      return { x: width / 2 + body.offsetX + x * Math.cos(body.tilt) - y * Math.sin(body.tilt),
        y: height / 2 + body.offsetY + x * Math.sin(body.tilt) + y * Math.cos(body.tilt) }
    }
    let lastPaint = -Infinity
    const animate = (now: number) => {
      // Retiring skies keep orbiting until their transition removes the SVG.
      if (controller.signal.aborted || !svg.isConnected) return
      if ((visible && !document.hidden && now - lastPaint >= 32) || reducedMotion.matches) {
        lastPaint = now
        const elapsed = reducedMotion.matches ? 0 : (now - epoch) / 1000
        for (const body of bodies) {
          const own = body.group.classList.contains("is-own")
          const angle = body.phase + elapsed / body.period * Math.PI * 2
          const front = (Math.sin(angle) + 1) / 2
          const scale = .38 + sparse * .24 + front * (.62 - sparse * .24)
          const point = position(body, angle)
          body.group.setAttribute("opacity", String(.09 + sparse * .27 + front ** 2 * (.86 - sparse * .27)))
          body.head.setAttribute("transform", `translate(${point.x} ${point.y}) scale(${scale})`)
          const arc = (.12 + front * .2) * (1 + sparse * .55) * (own ? 2.1 : 1)
          body.trails.forEach((trail, i) => {
            const from = position(body, angle - arc * (i + 1) / 7)
            const to = position(body, angle - arc * i / 7)
            trail.setAttribute("d", `M${from.x} ${from.y}L${to.x} ${to.y}`)
            const tailLength = own ? 15 : 8
            trail.setAttribute("stroke-width", String(Math.max(.35, body.radius * scale * .55 * (1 - i / tailLength))))
            trail.setAttribute("opacity", String((sparse * .2 + front ** 3 * (.65 - sparse * .2)) * (1 - i / tailLength) ** 1.4))
          })
        }
      }
      if (!reducedMotion.matches) orbitFrame = requestAnimationFrame(animate)
    }
    sky.replaceChildren(svg, tooltip)
    animate(performance.now())
  }
  const render = (data: VisitorSummary) => {
    if (!panel.isConnected || controller.signal.aborted) return
    if (!Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.today) || !Array.isArray(data.meteors)) throw new Error("Invalid visitor statistics")
    panel.querySelector("[data-visitors-total]")!.textContent = String(data.total)
    panel.querySelector("[data-visitors-today]")!.textContent = String(data.today)
    status.textContent = ""
    status.hidden = true
    panel.dataset.loaded = "true"
    currentData = data
    draw()
  }
  const observer = new ResizeObserver(() => {
    const size = `${sky.clientWidth}:${sky.clientHeight}`
    if (size === previousSize) return
    previousSize = size
    cancelAnimationFrame(drawFrame)
    drawFrame = requestAnimationFrame(draw)
  })
  observer.observe(sky)
  const visibility = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true })
  visibility.observe(sky)
  const motionChanged = () => draw()
  reducedMotion.addEventListener("change", motionChanged)
  window.addCleanup(() => { controller.abort(); observer.disconnect(); visibility.disconnect(); reducedMotion.removeEventListener("change", motionChanged); previous.removeEventListener("click", goPrevious); next.removeEventListener("click", goNext); cancelTransitions(); cancelAnimationFrame(drawFrame); cancelAnimationFrame(orbitFrame) })
  const flowBetween = (oldSky: SVGElement | undefined, direction: number) => {
    if (reducedMotion.matches) return
    const svg = sky.querySelector<SVGElement>(":scope > svg")
    if (!svg) return
    const timing = { duration: 900, easing: "cubic-bezier(.22, .61, .36, 1)" }
    if (oldSky) {
      departingSky = oldSky
      oldSky.setAttribute("aria-hidden", "true")
      oldSky.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none"
      // Keep the live retiring sky moving without intercepting hover.
      oldSky.querySelectorAll("[pointer-events]").forEach(node => node.setAttribute("pointer-events", "none"))
      sky.prepend(oldSky)
      const exit = oldSky.animate([
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: `translateX(${-direction * 16}px)` },
      ], { ...timing, fill: "forwards" })
      transitions.push(exit)
      void exit.finished.then(() => {
        oldSky.remove()
        if (departingSky === oldSky) departingSky = undefined
      }).catch(() => {})
    }
    transitions.push(svg.animate([
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
        ? sky.querySelector<SVGElement>(":scope > svg") ?? undefined
        : undefined
      render(data)
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
