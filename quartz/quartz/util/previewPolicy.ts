function pathname(url: URL) {
  return decodeURIComponent(url.pathname).replace(/\/(?:index(?:\.html)?)?$/, "")
}

function isNavigationPath(route: string) {
  return route === "" ||
    /^\/(?:reading|tags|friends|observatory|archives)(?:\/|$)/.test(route) ||
    /^\/(?:Share|Repo|Video)$/.test(route)
}

export function isNavigationLink(href: string, base: string): boolean {
  try {
    const site = new URL(base), url = new URL(href, site)
    return url.origin === site.origin && isNavigationPath(pathname(url))
  } catch { return false }
}

/** Skip destinations that cannot use the site's hover previews. */
export function isNonPreviewLink(href: string, base: string): boolean {
  try {
    const site = new URL(base), url = new URL(href, site)
    if (url.origin !== site.origin) return true
    const route = pathname(url)
    return isNavigationPath(route) ||
      /^\/(?:api|artalk)(?:\/|$)/.test(route) ||
      (!/^\/(?:Share|Repo|Video)\//.test(route) && /\.(?:rss|atom|xml)$/i.test(route))
  } catch { return true }
}
