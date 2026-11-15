/** Only web destinations outside the current site need a departure confirmation. */
export function externalDestination(href: string, base: string): URL | undefined {
  if (!href.trim() || href.trim().startsWith('#')) return
  try {
    const site = new URL(base), destination = new URL(href, site)
    if (!/^https?:$/.test(destination.protocol)) return
    if (destination.hostname !== site.hostname || destination.username || destination.password) return destination
  } catch { /* Malformed links keep their native behavior. */ }
}
