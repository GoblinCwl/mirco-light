export type GraphKind = "article" | "share" | "repo" | "video"

export function graphNodeKind(id: string): GraphKind | undefined {
  if (id === "/" || id.startsWith("tags/")) return undefined
  if (id.startsWith("Share/分享/")) return "share"
  if (id === "Repo" || id.startsWith("Repo/")) return "repo"
  if (id === "Video" || id.startsWith("Video/")) return "video"
  return "article"
}

// Keep tag nodes only when a selected content node uses them. Edges are pruned
// by the renderer against the remaining nodes, so hidden types cannot leak in.
export function filterGraphContent<K extends string, T extends { tags: string[] }>(
  data: Map<K, T>, selected: ReadonlySet<GraphKind>,
): Map<K, T> {
  const content = [...data].filter(([id]) => {
    const kind = graphNodeKind(id)
    return kind ? selected.has(kind) : id === "/"
  })
  const tags = new Set(content.flatMap(([, details]) => details.tags.map(tag => `tags/${tag}`)))
  return new Map([...content, ...[...data].filter(([id]) => id.startsWith("tags/") && tags.has(id))])
}
