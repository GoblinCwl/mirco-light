import type { ContentDetails } from "../../util/contentTypes"
import type { FullSlug, FilePath } from "../../util/path"
import { getAllSegmentPrefixes, slugTag } from "../../util/path"
import { sharePageKey } from "../../util/shareMetadata.mjs"
import type { DriveEntry } from "./driveEntries"

export function shareContent(entries: DriveEntry[]) {
  return entries.flatMap(entry => {
    if (entry.kind !== "share") return []
    const slug = decodeURIComponent(sharePageKey(entry.id)).replace(/^\/|\/$/g, "") as FullSlug
    const tags = [...new Set((entry.tags || []).map(slugTag).filter(Boolean))]
    return [{ slug, href: sharePageKey(entry.id), protected: entry.protected,
      page: { slug, filePath: String(slug) as FilePath, title: entry.id, content: "", links: [], tags, encrypted: entry.protected } as ContentDetails }]
  })
}
export const tagPrefixes = (tags: string[]) => [...new Set(tags.flatMap(getAllSegmentPrefixes))]
export {tagHref} from "../../util/tagLink"
