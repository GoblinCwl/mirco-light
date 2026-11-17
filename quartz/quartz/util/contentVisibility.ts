import { minimatch } from "minimatch"
import type { GlobalConfiguration } from "../cfg"
import type { QuartzPluginData, ProcessedContent } from "../plugins/vfile"
import { trieFromAllFiles } from "./ctx"
import { simplifySlug } from "./path"

export function matchesContentPath(path: string, patterns: string[] = []): boolean {
  const relative = path.replace(/^\/+/, "").replace(/\/$/, "")
  return patterns.some(pattern => minimatch(relative, pattern, { dot: true }) ||
    (!relative.endsWith(".md") && minimatch(relative + "/", pattern, { dot: true })))
}
export function isDraft(file: QuartzPluginData): boolean {
  const draft = file.frontmatter?.draft
  return draft === true || draft === "true"
}
export function isListed(file: QuartzPluginData, cfg: GlobalConfiguration): boolean {
  return !isDraft(file) &&
    !matchesContentPath(String(file.relativePath ?? file.slug ?? ""), cfg.unlistedPatterns)
}
export function listedContent(content: ProcessedContent[], cfg: GlobalConfiguration): ProcessedContent[] {
  return content.filter(([, file]) => isListed(file.data, cfg))
}
const cache = new WeakMap<QuartzPluginData[], QuartzPluginData[]>()
export function listedFiles(files: QuartzPluginData[], cfg: GlobalConfiguration): QuartzPluginData[] {
  let result = cache.get(files)
  if (!result) { result = files.filter(file => isListed(file, cfg)); cache.set(files, result) }
  return result.length === files.length ? files : result
}
export function visibleExplore(href: string, cfg: GlobalConfiguration): boolean {
  const path = decodeURIComponent(href).replace(/^\/+|\/+$/g, "")
  return !matchesContentPath(path + "/index.md", [...cfg.ignorePatterns, ...cfg.unlistedPatterns ?? []])
}
// Links to unlisted notes must not reintroduce them through the public graph.
export function publicLinks(content: ProcessedContent[], cfg: GlobalConfiguration): Set<string> {
  return new Set(content.filter(([, file]) => !isListed(file.data, cfg)).flatMap(([, file]) =>
    file.data.slug ? [file.data.slug, simplifySlug(file.data.slug)] : []))
}

const tries = new WeakMap<QuartzPluginData[], ReturnType<typeof trieFromAllFiles>>()
export function listedTrie(files: QuartzPluginData[]) {
  let trie = tries.get(files)
  if (!trie) { trie = trieFromAllFiles(files); tries.set(files, trie) }
  return trie
}
