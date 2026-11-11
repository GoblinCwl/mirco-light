import type { ContentDetails } from "../../util/contentTypes"
import type { FullSlug, FilePath } from "../../util/path"
import { RequestCache, sharedState } from "./sharedRequest"
export type IndexedContent = ContentDetails & {
  id: string
  type: "article" | "share" | "repo" | "video"
  href: string
  description: string
  updatedAt: string
  extra: Record<string, any>
}
export type ContentCatalog = { revision: string; pages: Record<string, IndexedContent> }
const state = sharedState("content-catalog:v1", () => ({
  requests: new RequestCache<ContentCatalog>(5000, 1),
  listening: false,
}))
if (typeof document !== "undefined" && !state.listening) {
  state.listening = true
  for (const event of ["drive-files-changed", "stellar-data-changed", "content-tags-changed"])
    document.addEventListener(event, () => {
      state.requests.clear()
    })
}
export function readContentCatalog(options: { refresh?: boolean; signal?: AbortSignal } = {}) {
  return state.requests.read(
    "content",
    async (signal) => {
      const response = await fetch("/api/site/content", {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
        cache: "no-cache",
      })
      if (!response.ok) throw Error("内容索引暂不可用")
      return (await response.json()) as ContentCatalog
    },
    options,
  )
}
export const peekContentCatalog = () => state.requests.peek("content", true)

// Folder names use original article paths, not slugified titles. Dynamic
// integrations keep their own tree branches and must never appear as articles.
export function articleIndex(catalog: ContentCatalog): Record<FullSlug, ContentDetails> {
  return Object.fromEntries(
    Object.entries(catalog.pages)
      .filter(([, page]) => page.type === "article")
      .map(([slug, page]) => {
        const path = typeof page.extra?.filePath === "string" ? page.extra.filePath : page.filePath
        return [
          slug,
          {
            ...page,
            slug: slug as FullSlug,
            filePath: (path?.endsWith(".md") ? path : `${slug}.md`) as FilePath,
          },
        ]
      }),
  ) as Record<FullSlug, ContentDetails>
}
export async function readArticleIndex(options: { refresh?: boolean; signal?: AbortSignal } = {}) {
  return articleIndex(await readContentCatalog(options))
}
