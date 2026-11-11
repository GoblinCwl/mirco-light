import path from "node:path"
import { Minimatch } from "minimatch"

export function sourceWatchIgnored(filename, stats) {
  const relative = path.relative(process.cwd(), filename).split(path.sep).join("/")
  if (relative.split("/").some(part => part === "node_modules" || part.startsWith(".")) || /(?:^|\/)(?:__tests__|__fixtures__)(?:\/|$)|\.(?:test|spec)\.[^/]+$/.test(relative)) return true
  if (!stats || stats.isDirectory()) return false
  return !relative.startsWith("quartz/static/") && !/\.(?:[cm]?js|tsx?|s?css|json)$/.test(relative)
}

// Prune whole excluded trees before chokidar allocates their watches. File-only
// patterns such as **/!(*.md) must never exclude a directory by its own name.
export function contentWatchIgnored(root, patterns, ignoreFile) {
  root = path.resolve(root)
  const excludedTrees = patterns.filter(pattern => pattern.endsWith("/**")).map(pattern => new Minimatch(pattern.slice(0, -3), { dot: true }))
  return (filename, stats) => {
    const relative = path.relative(root, path.resolve(filename)).split(path.sep).join("/")
    if (!relative) return false
    if (relative === ".." || relative.startsWith("../")) return true
    if (relative.split("/").some(part => part.startsWith("."))) return true
    if (excludedTrees.some(pattern => pattern.match(relative))) return true
    return stats && !stats.isDirectory() ? ignoreFile(relative) : false
  }
}
