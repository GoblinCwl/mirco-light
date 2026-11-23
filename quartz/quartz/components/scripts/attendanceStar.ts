const starOutline = "M24 3 28.5 19.5 43 24 28.5 28.5 24 45 19.5 28.5 5 24 19.5 19.5Z"
const starCore = "M24 12 26.6 21.4 34 24 26.6 26.6 24 36 21.4 26.6 14 24 21.4 21.4Z"
const frostFace = "M24 3 28.5 19.5 43 24 29.26 28.26 26.6 25.35 24.7 25.35 19.71 18.71Z"
const unfrostedFace = "M29.26 28.26 28.5 28.5 24 45 19.5 28.5 5 24 19.5 19.5 19.71 18.71 24.7 25.35 26.6 25.35Z"

let nextStarId = 0

export function attendanceStarSvg() {
  const frostClipId = `attendance-star-frost-${++nextStarId}`
  return `
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <defs><clipPath id="${frostClipId}" clipPathUnits="userSpaceOnUse"><path d="${frostFace}"/></clipPath></defs>
    <g class="calendar-star-split-halo">
      <path class="calendar-star-halo-base" d="${unfrostedFace}"/>
      <path class="calendar-star-halo-frost" d="${frostFace}"/>
    </g>
    <path class="calendar-star-outline" d="${starOutline}"/>
    <g class="calendar-star-frost-border">
      <path d="M19.71 18.71 24 3 28.5 19.5 43 24 29.26 28.26"/>
    </g>
    <path class="calendar-star-inner" d="${starOutline}"/>
    <g class="calendar-star-frost">
      <path d="${frostFace}"/>
    </g>
    <path class="calendar-star-core" d="${starCore}"/>
    <g class="calendar-star-frost-inset" clip-path="url(#${frostClipId})">
      <path class="calendar-star-core" d="${starCore}"/>
    </g>
  </svg>`
}
