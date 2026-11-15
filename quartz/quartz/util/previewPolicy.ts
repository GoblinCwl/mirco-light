/** Functional navigation pages have no article preview. Check before showing a loader. */
export function isNavigationLink(href: string, base: string): boolean {
  try {
    const site = new URL(base), url = new URL(href, site)
    if (url.origin !== site.origin) return false
    const route = decodeURIComponent(url.pathname).replace(/\/(?:index(?:\.html)?)?$/, "")
    return route === "" || /^\/(?:reading|tags|friends|observatory|archives)(?:\/|$)/.test(route) || /^\/(?:Share|Repo|Video)$/.test(route)
  } catch { return false }
}
