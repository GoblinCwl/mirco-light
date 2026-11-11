import {readAttendanceMonth} from './attendanceClient'
import { createAttendanceDetails, type AttendanceDetail } from "./attendanceDetails"

const attendanceTypes = {
  work: { label: "出勤", icon: "🏢" },
  business_trip: { label: "出差", icon: "🧳" },
  onsite: { label: "驻场", icon: "🏢" },
  fieldwork: { label: "外勤", icon: "🚶" },
  remote: { label: "居家", icon: "🏠" },
  comp_off: { label: "调休", icon: "🛋️" },
  weekend: { label: "周末", icon: "🛋️" },
  leave: { label: "请假", icon: "🌴" },
  holiday: { label: "节假日", icon: "🏖️" },
}
type AttendanceType = keyof typeof attendanceTypes

export function setupAttendanceCalendar() {
  document.querySelectorAll<HTMLElement>("[data-home-attendance]").forEach((calendar) => {
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date())
    let month = today.slice(0, 7)
    let records = new Map<string, AttendanceType>()
    let holidayNames = new Map<string, string>()
    let specialNames = new Map<string, string>()
    let earliest = "2026-07"
    let latest = month
    let loaded = false
    let detailRecords: AttendanceDetail[] = []
    let loadRevision=0
    const monthLabel = calendar.querySelector<HTMLElement>("[data-attendance-month]")!
    const grid = calendar.querySelector<HTMLElement>("[data-attendance-days]")!
    const summary = calendar.querySelector<HTMLElement>("[data-attendance-summary]")!
    const note = calendar.querySelector<HTMLElement>("[data-attendance-note]")
    const previous = calendar.querySelector<HTMLButtonElement>("[data-attendance-prev]")!
    const next = calendar.querySelector<HTMLButtonElement>("[data-attendance-next]")!
    if (![monthLabel, grid, summary, previous, next].every(Boolean)) return

    const detailsButton = calendar.querySelector<HTMLButtonElement>("[data-attendance-details]")
    const details = createAttendanceDetails(detailsButton, () => ({ month, today, earliest, latest, loaded, records: detailRecords }))
    const openDateDetails = (event: Event) => {
      const cell = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".home-attendance-day") : null
      if (!cell || !grid.contains(cell) || cell.disabled || !cell.dataset.date) return
      details.open(cell.dataset.date)
    }
    grid.addEventListener("click", openDateDetails)

    const speedRamps = new Map<Animation, number>()
    const changeStarSpeed = (event: PointerEvent, rate: number) => {
      if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const cell = event.target instanceof Element ? event.target.closest(".home-attendance-day") : null
      if (!cell || event.relatedTarget instanceof Node && cell.contains(event.relatedTarget)) return
      const animations = cell.getAnimations({ subtree: true }).filter(animation =>
        (animation as CSSAnimation).animationName === "calendar-star-spin")
      for (const spin of animations) {
        const targetRate = rate
        const pending = speedRamps.get(spin)
        if (pending !== undefined) cancelAnimationFrame(pending)
        const start = performance.now(), from = spin.playbackRate
        const ramp = (now: number) => {
          const progress = Math.min(1, (now - start) / 280)
          spin.updatePlaybackRate(from + (targetRate - from) * (progress * (2 - progress)))
          if (progress < 1) speedRamps.set(spin, requestAnimationFrame(ramp))
          else speedRamps.delete(spin)
        }
        speedRamps.set(spin, requestAnimationFrame(ramp))
      }
    }
    const onStarEnter = (event: PointerEvent) => changeStarSpeed(event, 8)
    const onStarLeave = (event: PointerEvent) => changeStarSpeed(event, 1)
    grid.addEventListener("pointerover", onStarEnter)
    grid.addEventListener("pointerout", onStarLeave)

    const rearrangements = new Set<Animation>()
    const clearRearrangement = () => {
      for (const animation of rearrangements) animation.cancel()
      rearrangements.clear()
    }
    const animateStar = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = element.animate(frames, options)
      rearrangements.add(animation)
      animation.onfinish = () => { rearrangements.delete(animation) }
      return animation
    }
    const render = (rearrange = false) => {
      clearRearrangement()
      const oldStars = new Map<string, { color: string; filter: string; opacity: string; strokes: string[]; cell: HTMLElement }>()
      const motionAllowed = rearrange && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (motionAllowed) {
        for (const cell of grid.querySelectorAll<HTMLElement>(".home-attendance-day:not(.outside)")) {
          const star = cell.querySelector<HTMLElement>(".home-attendance-star")!
          const style = getComputedStyle(star)
          oldStars.set(cell.dataset.slot!, { color: style.getPropertyValue("--star-color").trim(), opacity: style.opacity, filter: getComputedStyle(star.querySelector("svg")!).filter, strokes: [...star.querySelectorAll("path")].map(path => getComputedStyle(path).stroke), cell })
        }
      }

      const [year, number] = month.split("-").map(Number)
      monthLabel.textContent = `${year} 年 ${number} 月`
      previous.disabled = !loaded || month <= earliest
      next.disabled = !loaded || month >= latest
      const existingCells = [...grid.querySelectorAll<HTMLButtonElement>(":scope > .home-attendance-day")]
      const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7
      const cells = 42
      calendar.style.setProperty("--attendance-weeks", String(cells / 7))
      for (let index = 0; index < cells; index++) {
        const date = new Date(Date.UTC(year, number - 1, 1 - offset + index))
        const iso = date.toISOString().slice(0, 10)
        const inside = iso.startsWith(month)
        const status = records.get(iso)
        const type = status ? attendanceTypes[status] : null
        const statusLabel = status === "holiday" ? holidayNames.get(iso)?.replace(/节$/, "") ?? type!.label : type?.label
        const specialName = inside ? specialNames.get(iso) : undefined
        const cell = existingCells[index] || document.createElement("button")
        cell.type = "button"
        cell.setAttribute("aria-haspopup", "dialog")
        cell.disabled = !inside || (!status && iso > today)
        cell.style.visibility = ""
        cell.style.opacity = ""
        cell.removeAttribute("aria-current")
        delete cell.dataset.specialName
        cell.className = specialName ? "home-attendance-day special-day" : "home-attendance-day"
        cell.dataset.date = iso
        cell.dataset.day = String(date.getUTCDate())
        cell.dataset.slot = String(index)
        cell.dataset.status = inside && status ? status : "empty"
        if (!inside) cell.classList.add("outside")
        if (iso === today) { cell.classList.add("today"); cell.setAttribute("aria-current", "date") }
        const label = `${iso} · ${statusLabel ?? (iso > today ? "待记录" : "无记录")}`
        cell.title = label
        cell.setAttribute("aria-label", label)
        const day = cell.querySelector<HTMLElement>(".home-attendance-number") || document.createElement("span")
        day.removeAttribute("title")
        day.removeAttribute("aria-label")
        day.className = "home-attendance-number"
        day.textContent = String(date.getUTCDate())
        const state = cell.querySelector<HTMLElement>(".home-attendance-state") || document.createElement("span")
        state.className = "home-attendance-state"
        state.textContent = inside && type ? `${type.icon} ${statusLabel}` : ""
        const star = cell.querySelector<HTMLElement>(".home-attendance-star") || document.createElement("span")
        star.className = "home-attendance-star"
        star.setAttribute("aria-hidden", "true")
        if (!star.firstChild) star.innerHTML = '<span class="home-day-star-rotor"><svg viewBox="0 0 48 48" aria-hidden="true"><path class="calendar-star-outline" d="M24 3 28.5 19.5 43 24 28.5 28.5 24 45 19.5 28.5 5 24 19.5 19.5Z"/><path class="calendar-star-inner" d="M24 3 28.5 19.5 43 24 28.5 28.5 24 45 19.5 28.5 5 24 19.5 19.5Z"/><path class="calendar-star-core" d="M24 12 26.6 21.4 34 24 26.6 26.6 24 36 21.4 26.6 14 24 21.4 21.4Z"/></svg></span>'
        // Stable offsets add an organic rhythm while keeping weekday columns intact.
        let starSeed = 17
        for (const char of `calendar-slot-${index}`) starSeed = Math.imul(starSeed, 31) + char.charCodeAt(0) | 0
        starSeed = Math.imul(starSeed ^ (starSeed >>> 16), 0x7feb352d)
        starSeed = Math.imul(starSeed ^ (starSeed >>> 15), 0x846ca68b)
        starSeed = (starSeed ^ (starSeed >>> 16)) >>> 0
        cell.style.setProperty("--day-star-offset", `${((Math.imul(starSeed, 16807) >>> 0) % 11) - 5}px`)
        cell.style.setProperty("--day-star-x", `${((Math.imul(starSeed, 48271) >>> 0) % 7) - 3}px`)
        cell.style.setProperty("--day-star-angle", `${((starSeed >>> 8) % 90) - 45}deg`)
        cell.style.setProperty("--day-star-size", `${31 + ((Math.imul(starSeed, 69621) >>> 0) % 8)}px`)
        if (!existingCells[index]) cell.style.setProperty("--day-star-spin-phase", `${-performance.now() / 1000}s`)
        cell.style.setProperty("--day-star-spin", `${45 + starSeed % 46}s`)
        cell.style.setProperty("--day-star-direction", starSeed % 2 ? "reverse" : "normal")
        cell.style.setProperty("--day-star-period", `${5 + starSeed % 5}s`)
        cell.style.setProperty("--day-star-phase", `${-(starSeed % 80) / 10}s`)
        cell.style.setProperty("--day-star-brightness", `${0.9 + (starSeed % 11) / 100}`)
        const preview = detailRecords.some(record => record.date === iso && record.preview)
        cell.dataset.preview = String(preview)
        if (iso > today && !preview) cell.classList.add("future-day")
        if (!existingCells[index]) cell.append(day, state, star)
        let satellite = cell.querySelector<HTMLElement>(".home-day-special-aura")
        if (specialName && !satellite) {
          satellite = document.createElement("span")
          satellite.className = "home-day-special-aura"
          satellite.setAttribute("aria-hidden", "true")
          satellite.innerHTML = '<svg viewBox="0 0 80 80" fill="none"><g class="special-gold-rays" stroke="currentColor" stroke-width="1" stroke-linecap="round"><path d="m17 19 8 8m31-2 7-9m-7 39 8 7M24 55l-6 7"/></g><g fill="currentColor"><path class="special-gold-glint glint-one" d="M63 5 65 12 72 14 65 16 63 23 61 16 54 14 61 12Z"/><path class="special-gold-glint glint-two" d="M14 27.5 15.75 33.25 21.5 35 15.75 36.75 14 42.5 12.25 36.75 6.5 35 12.25 33.25Z"/><path class="special-gold-glint glint-three" d="M61 57.5 62.5 62.5 67.5 64 62.5 65.5 61 70.5 59.5 65.5 54.5 64 59.5 62.5Z"/></g></svg>'
          star.append(satellite)
          if (motionAllowed) {
            animateStar(satellite, [{ opacity: 0 }, { opacity: 1 }], { duration: 1000, easing: "ease-out" })
          }
        } else if (!specialName && satellite) {
          if (motionAllowed) {
            const retiringOrbit = satellite
            const animation = animateStar(retiringOrbit, [{ opacity: getComputedStyle(retiringOrbit).opacity }, { opacity: 0 }],
              { duration: 900, easing: "ease-in-out", fill: "forwards" })
            animation.onfinish = () => {
              if (!cell.dataset.specialName) retiringOrbit.remove()
              rearrangements.delete(animation)
            }
          } else satellite.remove()
        }
        if (specialName) {
          cell.dataset.specialName = specialName
          cell.classList.add("special-day")
          day.title = specialName
          day.setAttribute("aria-label", `${date.getUTCDate()}日 · ${specialName}`)
          cell.title = `${label} · ${specialName}`
          cell.setAttribute("aria-label", cell.title)
        }
        if (!existingCells[index]) grid.append(cell)
      }
      if (motionAllowed) {
        const options = { duration: 900, easing: "ease-in-out" }
        for (const cell of grid.querySelectorAll<HTMLElement>(".home-attendance-day:not(.outside)")) {
          const star = cell.querySelector<HTMLElement>(".home-attendance-star")!
          const previous = oldStars.get(cell.dataset.slot!)
          if (previous) {
            const color = getComputedStyle(star).getPropertyValue("--star-color").trim()
            for (const path of star.querySelectorAll(".calendar-star-outline, .calendar-star-inner")) {
              animateStar(path, [{ fill: previous.color }, { fill: color }], options)
            }
            star.querySelectorAll("path").forEach((path, index) => {
              animateStar(path, [{ stroke: previous.strokes[index] }, { stroke: getComputedStyle(path).stroke }], options)
            })
            const svg = star.querySelector("svg")!
            animateStar(svg, [{ filter: previous.filter }, { filter: getComputedStyle(svg).filter }], options)
            // End at the actual future-date opacity instead of flashing back from 100%.
            animateStar(star, [{ opacity: previous.opacity }, { opacity: getComputedStyle(star).opacity }], options)
            oldStars.delete(cell.dataset.slot!)
          } else animateStar(star, [{ opacity: 0 }, { opacity: getComputedStyle(star).opacity }], options)
        }
        for (const previous of oldStars.values()) {
          const cell = previous.cell
          cell.style.visibility = "visible"
          cell.style.opacity = "1"
          const star = cell.querySelector<HTMLElement>(".home-attendance-star")!
          const fadedColor = getComputedStyle(calendar).getPropertyValue("--gray").trim()
          for (const path of star.querySelectorAll(".calendar-star-outline, .calendar-star-inner")) {
            animateStar(path, [{ fill: previous.color }, { fill: fadedColor }], options)
          }
          star.querySelectorAll("path").forEach((path, index) => {
            animateStar(path, [{ stroke: previous.strokes[index] }, { stroke: getComputedStyle(path).stroke }], options)
          })
          const svg = star.querySelector("svg")!
          animateStar(svg, [{ filter: previous.filter }, { filter: getComputedStyle(svg).filter }], options)
          const animation = animateStar(star, [{ opacity: previous.opacity }, { opacity: 0 }], options)
          animation.onfinish = () => {
            rearrangements.delete(animation)
            cell.style.visibility = ""
            cell.style.opacity = ""
          }
        }
      }
      const counts = { work: 0, rest: 0, leave: 0 }
      records.forEach((status, date) => {
        if (!date.startsWith(month)) return
        if (["work", "business_trip", "onsite", "fieldwork", "remote"].includes(status ?? "")) counts.work++
        else if (status === "leave") counts.leave++
        else counts.rest++
      })
      summary.replaceChildren()
      for (const [key, label] of [["work", "出勤"], ["rest", "休息"], ["leave", "请假"]] as const) {
        const item = document.createElement("span")
        item.className = `home-attendance-count ${key}`
        const number = document.createElement("span")
        number.className = "home-attendance-count-number"
        number.textContent = loaded ? String(counts[key]) : "—"
        item.append(document.createTextNode(`${label} `), number, document.createTextNode(" 天"))
        summary.append(item)
      }
    }
    const shift = (delta: number) => {
      const [year, number] = month.split("-").map(Number)
      const target = new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7)
      if (target < earliest || target > latest) return
      month = target
      void loadMonth(true)
    }
    const onPrevious = () => shift(-1)
    const onNext = () => shift(1)
    previous.addEventListener("click", onPrevious)
    next.addEventListener("click", onNext)
    render()
    const controller = new AbortController()
    window.addCleanup(() => {
      controller.abort()
      for (const frame of speedRamps.values()) cancelAnimationFrame(frame)
      speedRamps.clear()
      grid.removeEventListener("pointerover", onStarEnter)
      grid.removeEventListener("pointerout", onStarLeave)
      clearRearrangement()
      grid.removeEventListener("click", openDateDetails)
      previous.removeEventListener("click", onPrevious)
      next.removeEventListener("click", onNext)
    })
    async function loadMonth(rearrange=false){
      const revision=++loadRevision,requestedMonth=month
      calendar.setAttribute('aria-busy','true')
      try{
        const result=await readAttendanceMonth(requestedMonth,controller.signal)
        if(!calendar.isConnected||controller.signal.aborted||revision!==loadRevision)return
        detailRecords=result.records
        records=new Map(result.records.filter(record=>record.status&&Object.hasOwn(attendanceTypes,record.status)).map(record=>[record.date,record.status as AttendanceType]))
        holidayNames=new Map(result.records.filter(record=>record.status==='holiday'&&typeof record.holidayName==='string').map(record=>[record.date,record.holidayName!]))
        specialNames=new Map(result.records.filter(record=>typeof record.specialName==='string'&&record.specialName).map(record=>[record.date,record.specialName!]))
        earliest=result.earliest||earliest;latest=result.latest||today.slice(0,7);loaded=true
        if(note)note.textContent=result.stale?'上次同步记录':''
        render(rearrange);details.refresh()
      }catch{if(!controller.signal.aborted&&revision===loadRevision){if(note)note.textContent='出勤记录暂不可用';loaded=true;render()}}
      finally{if(calendar.isConnected&&revision===loadRevision){delete calendar.dataset.homePending;calendar.setAttribute('aria-busy','false')}}
    }
    void loadMonth()

  })
}
