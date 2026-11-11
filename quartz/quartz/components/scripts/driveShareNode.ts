import type { Graphics } from "pixi.js"

// The ordinary round node carries one high-contrast, single-stroke paperclip.
export function drawDriveShareNode(gfx: Graphics, radius: number, color: string, contrast: string) {
  const unit = radius / 16
  const x = (value: number) => (value - 12) * unit
  const y = (value: number) => (value - 12) * unit
  gfx.clear().circle(0, 0, radius).fill({ color })
    .moveTo(x(20), y(11)).lineTo(x(11), y(20))
    .bezierCurveTo(x(8), y(23), x(3), y(21), x(3), y(17))
    .bezierCurveTo(x(3), y(15), x(4), y(14), x(5), y(13))
    .lineTo(x(14), y(4))
    .bezierCurveTo(x(16), y(2), x(19), y(3), x(19), y(6))
    .bezierCurveTo(x(19), y(7), x(18), y(8), x(18), y(8))
    .lineTo(x(10), y(16))
    .bezierCurveTo(x(8), y(18), x(6), y(16), x(8), y(14))
    .lineTo(x(15), y(7))
    .stroke({ width: Math.max(.85, radius * .18), color: contrast, cap: "round", join: "round" })
}

// Keep the same round base as articles and shares; the inset play glyph
// identifies video nodes without changing their outer silhouette.
export function drawVideoNode(gfx: Graphics, radius: number, color: string, contrast: string) {
  gfx.clear()
    .circle(0, 0, radius)
    .fill({ color })
    .moveTo(-radius * .25, -radius * .45)
    .lineTo(radius * .5, 0)
    .lineTo(-radius * .25, radius * .45)
    .closePath()
    .fill({ color: contrast })
}

export function drawRepoNode(gfx: Graphics, radius: number, color: string, contrast: string) {
  gfx.clear().circle(0, 0, radius).fill({ color })
    .moveTo(-radius * .25, -radius * .4).lineTo(-radius * .65, 0).lineTo(-radius * .25, radius * .4)
    .moveTo(radius * .25, -radius * .4).lineTo(radius * .65, 0).lineTo(radius * .25, radius * .4)
    .stroke({ color: contrast, width: Math.max(.85, radius * .18), cap: "round", join: "round" })
}
