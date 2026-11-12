import {renderRepoMermaid} from './repoMermaid'
import {sharedState} from "./sharedRequest"
import {repoMarkdownLink,type RepoInfo} from "./repoShared"
const scripts = sharedState("repo-render-libraries:v1",()=>new Map<string, Promise<void>>())
export function library(path: string) {
  if (!scripts.has(path)) scripts.set(path, new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"), timer = setTimeout(() => { script.remove(); reject(new Error("渲染组件加载超时")) }, 15000)
    script.src = `/static/vendor/${path}`
    script.onload = () => { clearTimeout(timer); resolve() }
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("渲染组件加载失败")) }
    document.head.append(script)
  }).catch(error => { scripts.delete(path); throw error }))
  return scripts.get(path)!
}
export const runtime = window as typeof window & {
  marked?: { parse: (text: string, options?: Record<string, unknown>) => string | Promise<string> }
  DOMPurify?: { sanitize: (html: string, options?: Record<string, unknown>) => string }
  hljs?: { highlightElement: (element: HTMLElement) => void; getLanguage: (name: string) => unknown }
}

export async function markdown(host: HTMLElement, text: string, filename: string, info: Pick<RepoInfo,"name">, ref: string, signal: AbortSignal, revealHash = true) {
  await Promise.all([library("marked/15.0.12/lib/marked.umd.js"), library("dompurify/3.2.7/dist/purify.min.js")])
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
    if (/^https?:/i.test(target)) { anchor.target = "_blank"; anchor.rel = "noopener noreferrer"; anchor.dataset.routerIgnore = "true" }
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

