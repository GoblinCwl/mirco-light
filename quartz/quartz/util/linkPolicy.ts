/** Navigation policy shared by generated articles and runtime Markdown. */
export function contentLinkKind(href: string, baseUrl = "https://goblincwl.site/"): "internal" | "external" | "special" | "attachment" {
  if (href.startsWith("#")) return "internal"
  try {
    const base = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`)
    const url = new URL(href, base)
    if (!/^https?:$/.test(url.protocol)) return "special"
    if (/\.(?:pdf|png|jpe?g|gif|webp|avif|svg|ico|mp[34]|m4[av]|webm|ogg|wav|flac|zip|7z|rar|tar|gz|exe|apk|dmg|iso)$/i.test(url.pathname)) return "attachment"
    return url.hostname === base.hostname && !url.username && !url.password ? "internal" : "external"
  } catch { return "special" }
}

export function applyContentLinkPolicy(anchor: HTMLAnchorElement, baseUrl = "https://goblincwl.site/") {
  if (anchor.hasAttribute("download")) return
  const kind = contentLinkKind(anchor.getAttribute("href") || "", baseUrl)
  if (kind === "external") {
    anchor.target = "_blank"
    anchor.rel = [...new Set([...anchor.rel.split(/\s+/).filter(Boolean), "noopener", "noreferrer"])].join(" ")
    anchor.dataset.routerIgnore = "true"
  } else if (kind === "internal" || kind === "special") {
    anchor.removeAttribute("target")
    if (kind === "internal") delete anchor.dataset.routerIgnore
  }
}
