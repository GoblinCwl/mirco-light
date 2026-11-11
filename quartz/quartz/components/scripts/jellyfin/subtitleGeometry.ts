/** Use CSS pixels and media aspect, never source resolution or container height.
 * Reference is the largest fullscreen picture on this display, oriented to the
 * media. This remains stable when a phone rotates or a portrait player grows. */
export function subtitleGeometry(
  viewportWidth: number,
  viewportHeight: number,
  mediaAspect: number,
  screenWidth: number,
  screenHeight: number,
) {
  if (![viewportWidth, viewportHeight].every((n) => Number.isFinite(n) && n > 0)) return
  const aspect = Number.isFinite(mediaAspect) && mediaAspect > 0 ? mediaAspect : 16 / 9
  const displayWidth = Number.isFinite(screenWidth) && screenWidth > 0 ? screenWidth : viewportWidth
  const displayHeight =
    Number.isFinite(screenHeight) && screenHeight > 0 ? screenHeight : viewportHeight
  const long = Math.max(displayWidth, displayHeight),
    short = Math.min(displayWidth, displayHeight)
  const referenceWidth = Math.min(aspect >= 1 ? long : short, (aspect >= 1 ? short : long) * aspect)
  const referenceHeight = referenceWidth / aspect
  const width = Math.min(viewportWidth, viewportHeight * aspect)
  const height = width / aspect
  return {
    x: (viewportWidth - width) / 2,
    y: (viewportHeight - height) / 2,
    width,
    height,
    referenceWidth,
    referenceHeight,
    scale: width / referenceWidth,
  }
}
