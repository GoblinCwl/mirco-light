/** Project homepages are runtime content, not Markdown files known to Quartz. */
export function projectSlug(pathname: string): string | undefined {
  try {
    const parts = pathname.replace(/^\/+|\/+$/g, '').split('/').map(decodeURIComponent)
    if (parts.some(part => !part || part === '.' || part === '..' || /[/\\\u0000-\u001f\u007f]/.test(part))) return
    if (parts.length === 2 && (parts[0] === 'Repo' || parts[0] === 'Video')) return parts.join('/')
    if (parts.length === 3 && parts[0] === 'Share' && parts[1] === '分享') return parts.join('/')
  } catch { /* Malformed escapes are not project references. */ }
}

export function projectReference(href: string, baseUrl?: string): { slug: string; href: string } | undefined {
  try {
    const site = new URL(baseUrl?.includes('://') ? baseUrl : `https://${baseUrl || 'quartz.invalid'}`)
    // Relative note links must still go through Quartz's normal resolver.
    if (!href.startsWith('/') && !/^https?:\/\//i.test(href)) return
    const url = new URL(href, site)
    if (!/^https?:$/.test(url.protocol) || url.host !== site.host || url.username || url.password) return
    const slug = projectSlug(url.pathname)
    if (!slug) return
    return { slug, href: '/' + slug.split('/').map(encodeURIComponent).join('/') + url.search + url.hash }
  } catch { return }
}
