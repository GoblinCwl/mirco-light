import type { ContentDetails } from "../../util/contentTypes"
import { slugTag, type FullSlug, type SimpleSlug } from "../../util/path"
import { sharePageKey } from "../../util/shareMetadata.mjs"
import type { DriveEntry } from "./driveEntries"

export function mergeDriveShareGraph(data: Map<SimpleSlug, ContentDetails>, entries: DriveEntry[]) {
  for (const entry of entries) if (entry.kind === "share") {
    const id = driveShareGraphSlug(entry.id)
    const tags = Array.isArray(entry.tags) ? entry.tags.filter(tag => typeof tag === "string").map(slugTag) : []
    data.set(id, { slug: String(id) as FullSlug, filePath: String(id) as ContentDetails["filePath"], title: entry.id, links: [], tags, content: "" })
  }
}

export const isDriveShareGraphNode = (id: string) => /^Share\/分享\/[^/]+$/.test(id)

export const driveShareGraphSlug = (id: string) => decodeURIComponent(sharePageKey(id)).replace(/^\/|\/$/g, "") as SimpleSlug
