import type { QuartzPluginData } from "../plugins/vfile"

type Dates = NonNullable<QuartzPluginData["dates"]>
type Node = { own?: Dates; present?: boolean; dates?: Dates; children: Set<string> }
const keys = ["created", "modified", "published"] as const
const nodePath = (slug: string) =>
  slug
    .split("/")
    .filter(Boolean)
    .filter((part, i, parts) => part !== "index" || i !== parts.length - 1)
    .join("/")

/** Build-time index. Each directory reads only its immediate children's summaries. */
export class DirectoryDates {
  private nodes = new Map<string, Node>()
  private files = new Map<string, { path: string; dates?: Dates }>()

  get(slug: string): Dates | undefined {
    return this.nodes.get(nodePath(slug))?.dates
  }

  sync(files: QuartzPluginData[]) {
    const seen = new Set<string>()
    const dirty = new Map<number, Set<string>>()
    let maxDepth = 0
    const mark = (path: string) => {
      const parts = path ? path.split("/") : []
      for (let depth = parts.length; depth >= 0; depth--) {
        const name = parts.slice(0, depth).join("/")
        let node = this.nodes.get(name)
        if (!node) {
          node = { children: new Set() }
          this.nodes.set(name, node)
        }
        if (depth < parts.length) node.children.add(parts.slice(0, depth + 1).join("/"))
        let bucket = dirty.get(depth)
        if (!bucket) dirty.set(depth, (bucket = new Set()))
        // Its ancestors are already marked too; do not walk them again per file.
        if (bucket.has(name)) break
        bucket.add(name)
      }
      maxDepth = Math.max(maxDepth, parts.length)
    }

    for (const file of files) {
      if (!file.frontmatter || !file.slug) continue
      const id = file.filePath ?? file.slug
      seen.add(id)
      const path = nodePath(file.slug)
      const previous = this.files.get(id)
      const unchanged =
        previous?.path === path &&
        keys.every((key) => previous.dates?.[key]?.getTime() === file.dates?.[key]?.getTime())
      if (unchanged) continue
      if (previous && previous.path !== path) {
        this.nodes.get(previous.path)!.own = undefined
        this.nodes.get(previous.path)!.present = false
        mark(previous.path)
      }
      mark(path)
      // Snapshot dates, so in-place metadata changes are detected on the next rebuild.
      const dates =
        file.dates &&
        (Object.fromEntries(keys.map((key) => [key, new Date(file.dates![key])])) as
          | Dates
          | undefined)
      this.nodes.get(path)!.own = dates
      this.nodes.get(path)!.present = true
      this.files.set(id, { path, dates })
    }
    for (const [id, previous] of this.files) {
      if (seen.has(id)) continue
      this.nodes.get(previous.path)!.own = undefined
      this.nodes.get(previous.path)!.present = false
      this.files.delete(id)
      mark(previous.path)
    }

    for (let depth = maxDepth; depth >= 0; depth--) {
      for (const path of dirty.get(depth) ?? []) {
        const node = this.nodes.get(path)!
        let dates = node.own && { ...node.own }
        for (const childPath of node.children) {
          const childDates = this.nodes.get(childPath)?.dates
          if (!childDates) continue
          if (!dates) dates = { ...childDates }
          else
            for (const key of keys) {
              if (childDates[key] > dates[key]) dates[key] = childDates[key]
            }
        }
        node.dates = dates
        if (!node.present && node.children.size === 0) {
          this.nodes.delete(path)
          const parent = path.split("/").slice(0, -1).join("/")
          this.nodes.get(parent)?.children.delete(path)
        }
      }
    }
  }
}
