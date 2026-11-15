/** Transparent standalone marks need breathing room; full-bleed tiles do not. */
export function faviconNeedsPadding(pixels: ArrayLike<number>, size: number): boolean {
  const edge = Math.max(1, Math.round(size * .1))
  let total = 0, opaque = 0
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x >= edge && x < size - edge && y >= edge && y < size - edge) continue
    total++
    if (pixels[(y * size + x) * 4 + 3] > 200) opaque++
  }
  return !total || opaque / total < .5
}

/** Exact host matches only; custom URLs may contain query-string '=' characters. */
export function faviconCandidates(destination: URL, mapping: string): string[] {
  const candidates: string[] = []
  for (const line of mapping.split('\n')) {
    const separator = line.indexOf('=')
    if (separator < 0) continue
    try {
      const host = new URL(`https://${line.slice(0, separator).trim()}`)
      const icon = new URL(line.slice(separator + 1).trim())
      if (host.hostname === destination.hostname && /^https?:$/.test(icon.protocol) && !icon.username && !icon.password) {
        candidates.push(icon.href)
        break
      }
    } catch { /* Ignore invalid legacy values. */ }
  }
  candidates.push(...['/favicon.ico', '/favicon.png'].map(path => new URL(path, destination.origin).href))
  return [...new Set(candidates)]
}
