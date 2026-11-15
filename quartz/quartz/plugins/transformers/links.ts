import {fromHtml} from "hast-util-from-html"
import {linkIconSVG,articleLinkRoutes} from "../../util/linkIcons"
import { isNavigationLink } from "../../util/previewPolicy"
import { QuartzTransformerPlugin } from "../types"
import {
  FullSlug,
  RelativeURL,
  SimpleSlug,
  TransformOptions,
  stripSlashes,
  simplifySlug,
  splitAnchor,
  transformLink,
} from "../../util/path"
import { contentLinkKind } from "../../util/linkPolicy"
import { projectReference } from "../../util/projectReference"
import path from "path"
import { visit } from "unist-util-visit"
import isAbsoluteUrl from "is-absolute-url"
import { Root,Element } from "hast"

function decorateLink(node:Element,href:string,base:string,articles:ReadonlySet<string>) {
  const illustrated=(element:Element):boolean=> {
    const classes=String(element.properties.className||"")
    if(classes.includes("encrypted-mark"))return false
    return ["svg","img","picture"].includes(element.tagName)||element.children.some(child=>child.type==="element"&&illustrated(child))
  }
  if(node.children.some(child=>child.type==="element"&&illustrated(child)))return
  const icon=linkIconSVG(href,base,articles)
  if(icon){
    const element=fromHtml(icon,{fragment:true}).children.find(child=>child.type==="element")
    if(!element)return
    const prepend=(parent:Element):boolean=>{
      for(let i=0;i<parent.children.length;i++){
        const child=parent.children[i]
        if(child.type==="text"&&child.value.trim()){parent.children.splice(i,0,element);return true}
        if(child.type==="element"&&prepend(child))return true
      }
      return false
    }
    prepend(node)
  }
}

interface Options {
  /** How to resolve Markdown paths */
  markdownLinkResolution: TransformOptions["strategy"]
  /** Strips folders from a link so that it looks nice */
  prettyLinks: boolean
  openLinksInNewTab: boolean
  lazyLoad: boolean
}

const defaultOptions: Options = {
  markdownLinkResolution: "absolute",
  prettyLinks: true,
  openLinksInNewTab: false,
  lazyLoad: false,
}

export const CrawlLinks: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "LinkProcessing",
    htmlPlugins(ctx) {
      return [
        () => {
          return (tree: Root, file) => {
            const curSlug = simplifySlug(file.data.slug!)
            const articleRoutes = articleLinkRoutes(ctx.allSlugs)
            const outgoing: Set<SimpleSlug> = new Set()

            const transformOptions: TransformOptions = {
              strategy: opts.markdownLinkResolution,
              allSlugs: ctx.allSlugs,
            }

            visit(tree, "element", (node, _index, _parent) => {
              // rewrite all links
              if (
                node.tagName === "a" &&
                node.properties &&
                typeof node.properties.href === "string"
              ) {
                let dest = node.properties.href as RelativeURL
                const classes = (node.properties.className ?? []) as string[]
                // Tag destinations carry a query, not a Markdown file path. Do
                // not slugify their query or include a nonexistent archive node.
                if (dest.startsWith("/tags/?tag=")) {
                  node.properties.className = [...classes, "internal", "tag-link"]
                  node.properties["data-no-popover"] = "true"
                  return
                }
                const siteBase = ctx.cfg.configuration.baseUrl || "goblincwl.site"
                const siteOrigin = new URL(siteBase.includes("://") ? siteBase : `https://${siteBase}`)
                const navigationLink = isNavigationLink(dest, new URL(file.data.slug!, siteOrigin.origin + "/").href)
                if (navigationLink) {
                  node.properties["data-no-popover"] = "true"
                }
                const project = navigationLink ? undefined : projectReference(dest, ctx.cfg.configuration.baseUrl)
                if (project) {
                  if (!Object.hasOwn(node.properties, "download")) delete node.properties.target
                  outgoing.add(project.slug as SimpleSlug)
                  node.properties.href = project.href
                  node.properties["data-slug"] = project.slug
                  node.properties.className = [...classes.filter(name => name !== "external" && name !== "internal"), "internal"]
                  if (project.slug.startsWith("Repo/")) node.properties["data-repo-hover"] = "true"
                  if (project.slug.startsWith("Video/")) {
                    node.properties["data-video-reference"] = project.slug.slice("Video/".length)
                    node.properties["data-no-popover"] = "true"
                  }
                  decorateLink(node,project.href,siteOrigin.origin,articleRoutes)
                  return
                }
                // Absolute article links, including alias routes, also participate in the index.
                try {
                  const url = new URL(dest, siteOrigin.origin + "/" + file.data.slug!)
                  if (/^https?:$/.test(url.protocol) && url.host === siteOrigin.host && !url.username && !url.password) {
                    const candidate = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").replace(/\.html$/, "")
                    const known = ctx.allSlugs.find(slug => String(simplifySlug(slug)) === String(simplifySlug(candidate as FullSlug)))
                    if (known && !isNavigationLink(url.href,siteOrigin.origin) && (dest.startsWith("/") || /^https?:\/\//i.test(dest))) outgoing.add(simplifySlug(known))
                  }
                } catch { /* Invalid URLs are not indexed. */ }
                const linkKind = contentLinkKind(dest, ctx.cfg.configuration.baseUrl)
                const isExternal = linkKind === "external"
                classes.push(isExternal ? "external" : "internal")


                // Check if the link has alias text
                if (
                  node.children.length === 1 &&
                  node.children[0].type === "text" &&
                  node.children[0].value !== dest
                ) {
                  // Add the 'alias' class if the text content is not the same as the href
                  classes.push("alias")
                }
                node.properties.className = classes

                if (!Object.hasOwn(node.properties, "download")) {
                  if (isExternal && opts.openLinksInNewTab) {
                    node.properties.target = "_blank"
                    const rel = String(node.properties.rel ?? "").split(/\s+/).filter(Boolean)
                    node.properties.rel = [...new Set([...rel, "noopener", "noreferrer"])]
                  } else if (linkKind === "internal" || linkKind === "special") {
                    delete node.properties.target
                  }
                }

                // don't process external links or intra-document anchors
                const isInternal = !(
                  isAbsoluteUrl(dest, { httpOnly: false }) || dest.startsWith("//") || dest.startsWith("#")
                )
                if (isInternal) {
                  dest = node.properties.href = transformLink(
                    file.data.slug!,
                    dest,
                    transformOptions,
                  )

                  // url.resolve is considered legacy
                  // WHATWG equivalent https://nodejs.dev/en/api/v18/url/#urlresolvefrom-to
                  const url = new URL(dest, "https://base.com/" + stripSlashes(curSlug, true))
                  const canonicalDest = url.pathname
                  let [destCanonical, _destAnchor] = splitAnchor(canonicalDest)
                  if (destCanonical.endsWith("/")) {
                    destCanonical += "index"
                  }

                  // need to decodeURIComponent here as WHATWG URL percent-encodes everything
                  const full = decodeURIComponent(stripSlashes(destCanonical, true)) as FullSlug
                  const simple = simplifySlug(full)
                  if (!navigationLink) outgoing.add(simple)
                  node.properties["data-slug"] = full
                }

                // rewrite link internals if prettylinks is on
                if (
                  opts.prettyLinks &&
                  isInternal &&
                  node.children.length === 1 &&
                  node.children[0].type === "text" &&
                  !node.children[0].value.startsWith("#")
                ) {
                  node.children[0].value = path.basename(node.children[0].value)
                }
                decorateLink(node,String(node.properties.href),new URL(file.data.slug!,siteOrigin.origin+"/").href,articleRoutes)
              }

              // transform all other resources that may use links
              if (
                ["img", "video", "audio", "iframe"].includes(node.tagName) &&
                node.properties &&
                typeof node.properties.src === "string"
              ) {
                if (opts.lazyLoad) {
                  node.properties.loading = "lazy"
                }

                if (!isAbsoluteUrl(node.properties.src, { httpOnly: false })) {
                  let dest = node.properties.src as RelativeURL
                  dest = node.properties.src = transformLink(
                    file.data.slug!,
                    dest,
                    transformOptions,
                  )
                  node.properties.src = dest
                }
              }
            })

            file.data.links = [...outgoing]
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    links: SimpleSlug[]
  }
}
