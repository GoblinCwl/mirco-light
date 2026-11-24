import {applyContentLinkPolicy} from "../../util/linkPolicy"
import {renderRepoMermaid} from './repoMermaid'
import {loadMarkdownRuntime,runtime} from "./markdownRuntime"
import {repoMarkdownLink,type RepoInfo} from "./repoShared"
export async function markdown(host: HTMLElement, text: string, filename: string, info: Pick<RepoInfo,"name">, ref: string, signal: AbortSignal, revealHash = true) {
  await loadMarkdownRuntime()
  const html = await runtime.marked!.parse(text, { gfm: true })
  if (signal.aborted) return
  host.innerHTML = runtime.DOMPurify!.sanitize(html, { FORBID_TAGS: ["style", "form", "iframe", "input", "button"], FORBID_ATTR: ["style", "srcset"] })
  for (const image of host.querySelectorAll<HTMLImageElement>("img")) {
    image.src = repoMarkdownLink(image.getAttribute("src") || "", filename, info.name, ref, true)
    image.loading = "lazy"; image.referrerPolicy = "no-referrer"
  }
  for (const anchor of host.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const target = repoMarkdownLink(anchor.getAttribute("href") || "", filename, info.name, ref)
    anchor.href = target || "#"
    anchor.dataset.noPopover = "true"
    applyContentLinkPolicy(anchor)
  }
  const ids = new Map<string, number>()
  for (const heading of host.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")) {
    const slug = (heading.textContent || "").trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-")
    const count = ids.get(slug) || 0; ids.set(slug, count + 1); heading.id = slug + (count ? `-${count}` : "")
  }
  await renderRepoMermaid(host,signal,svg=>runtime.DOMPurify!.sanitize(svg,{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:["foreignObject"],FORBID_ATTR:["onload","onclick"]}))
  if (signal.aborted) return
  if (revealHash && host.isConnected && location.hash) {
    try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView() } catch { /* Ignore malformed fragments. */ }
  }
}

