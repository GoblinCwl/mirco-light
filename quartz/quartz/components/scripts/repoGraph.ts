import type { ContentDetails } from "../../util/contentTypes"
import { slugTag, type FullSlug, type SimpleSlug } from "../../util/path"
import { repoHref, type RepoCatalog } from "./repoShared"

export const repoGraphSlug = (name: string) => `Repo/${name}` as SimpleSlug
export function repoGraphContent(catalog: RepoCatalog) {
  return catalog.repositories.map(repo => {
    const slug = repoGraphSlug(repo.name)
    return { slug: String(slug) as FullSlug, href: repoHref(repo.name), protected: false,
      page: { slug: String(slug) as FullSlug, filePath: String(slug) as ContentDetails["filePath"], title: repo.name,
        content: repo.description || "", links: [], tags: repo.language ? [slugTag(repo.language)] : [] } as ContentDetails }
  })
}
export function mergeRepoGraph(data: Map<SimpleSlug, ContentDetails>, catalog: RepoCatalog) {
  data.delete("Repo" as SimpleSlug)
  for (const repo of repoGraphContent(catalog)) data.set(repoGraphSlug(repo.page.title), repo.page)
}
