import type { ContentCatalog, IndexedContent } from "../components/scripts/contentCatalog"

export const relationSlug = (slug: string) => slug.replace(/^\/+|\/+$/g, "").replace(/(?:^|\/)index$/, "")

export function currentContent(catalog: ContentCatalog, href: string, articleSlug = ""): IndexedContent | undefined {
  const url = new URL(href)
  const path = relationSlug(decodeURIComponent(url.pathname))
  const pages = Object.values(catalog.pages)
  const article = catalog.pages[articleSlug]
  if (article?.type === "article") return article
  return pages.find(page => {
    const target = relationSlug(decodeURIComponent(new URL(page.href, url.origin).pathname))
    return target === path || page.type === "share" && path.startsWith(target + "/")
  })
}

export function contentBacklinks(catalog: ContentCatalog, slug: string): IndexedContent[] {
  const target = relationSlug(slug)
  return Object.values(catalog.pages)
    .filter(page => relationSlug(page.slug) !== target && page.links.some(link => relationSlug(link) === target))
    .sort((a,b) => a.title.localeCompare(b.title,"zh-CN") || a.slug.localeCompare(b.slug))
}
