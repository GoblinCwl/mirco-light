import type { Link, Root } from "mdast"
import type { VFile } from "vfile"
import { fromHtml } from "hast-util-from-html"
import { JSON_SCHEMA, load } from "js-yaml"
import { remark } from "remark"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { visit } from "unist-util-visit"
import type { BuildCtx } from "./ctx"
import { isListed } from "./contentVisibility"
import { simplifySlug, transformLink } from "./path"

const markdown = remark().use(remarkGfm).use(remarkMath)
const frontmatter = /^---[ \t]*\r?\n((?:[^\r\n]*\r?\n)*?)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

export function originalKnowledgeMetadata(source: string) {
  return source.match(frontmatter)?.[1].replace(/\r?\n$/, "") ?? ""
}

export function prepareKnowledgeMarkdown(ctx: BuildCtx, input: Root, file: VFile) {
  const { slug, frontmatter, relativePath, knowledgeMetadata } = file.data
  delete file.data.knowledgeMetadata
  const cfg = ctx.cfg.configuration
  if (knowledgeMetadata === undefined || !slug || !relativePath || !isListed(file.data, cfg) || frontmatter?.passphrase) return

  const origin = new URL(cfg.baseUrl?.includes("://") ? cfg.baseUrl : `https://${cfg.baseUrl || "quartz.invalid"}`)
  const folder = slug.endsWith("/index")
  const route = String(simplifySlug(slug)).split("/").filter(Boolean).map(encodeURIComponent).join("/")
  const page = new URL("/" + route + (folder ? "/" : ""), origin)
  const absoluteLink = (target: string) => {
    try {
      if (/^[a-z][a-z\d+.-]*:/i.test(target)) return target
      if (/^(?:\/|#|\?)/.test(target)) return new URL(target, page).href
      const resolved = transformLink(slug, target, { strategy: "shortest", allSlugs: ctx.allSlugs })
      return new URL(resolved, page).href
    } catch {
      return target
    }
  }

  const tree = structuredClone(input)
  tree.children = tree.children.filter(node => !["yaml", "toml"].includes(node.type))
  visit(tree, (node, index, parent) => {
    if (node.type === "link" || node.type === "image" || node.type === "definition") node.url = absoluteLink(node.url)
    if (node.type !== "html" || !parent || index === undefined) return
    if (!node.data?.hProperties?.transclude && !/^<(?:video|audio|iframe)\b/i.test(node.value)) return
    const element = fromHtml(node.value, { fragment: true }).children[0]
    if (element?.type !== "element") return
    const embed = element.children.find(child => child.type === "element" && child.tagName === "a")
    const target = embed?.type === "element" ? embed.properties.href : element.properties.src
    if (typeof target !== "string" || !target) return
    const alias = element.properties.dataEmbedAlias
    const label = typeof alias === "string" && alias !== "undefined" && alias ? alias : target
    const link: Link = { type: "link", url: absoluteLink(target), children: [{ type: "text", value: label }] }
    parent.children[index] = ["root", "blockquote", "listItem"].includes(parent.type)
      ? { type: "paragraph", children: [link] }
      : link
  })
  const hasMetadata = load(knowledgeMetadata, { schema: JSON_SCHEMA }) != null
  const body = markdown.stringify(tree)
    .replace(/🔐[βγ][\s\S]*?🔐/g, "[加密文本]")
    .replace(/🔐[βγ][\s\S]*$/, "[加密文本]\n")
  file.data.knowledge = {
    path: String(relativePath),
    metadata: hasMetadata ? knowledgeMetadata.replace(/\r\n/g, "\n") : "{}",
    body,
  }
}

declare module "vfile" {
  interface DataMap {
    knowledgeMetadata?: string
    knowledge?: { path: string; metadata: string; body: string }
  }
}
