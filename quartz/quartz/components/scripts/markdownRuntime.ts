import { sharedState } from "./sharedRequest"
import type { MarkdownTokenizer } from "../../util/markdownAutolinks"

const scripts = sharedState("repo-render-libraries:v1", () => new Map<string, Promise<void>>())

export function library(path: string) {
  if (!scripts.has(path)) scripts.set(path, new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    const timer = setTimeout(() => { script.remove(); reject(new Error("渲染组件加载超时")) }, 15000)
    script.src = `/static/vendor/${path}`
    script.onload = () => { clearTimeout(timer); resolve() }
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("渲染组件加载失败")) }
    document.head.append(script)
  }).catch(error => { scripts.delete(path); throw error }))
  return scripts.get(path)!
}

export const runtime = window as typeof window & {
  marked?: {
    Tokenizer: new () => MarkdownTokenizer
    parse: {
      (text: string, options: { gfm: boolean; async: false; tokenizer?: MarkdownTokenizer }): string
      (text: string, options?: Record<string, unknown>): string | Promise<string>
    }
  }
  DOMPurify?: {
    sanitize: {
      (html: string, options: { RETURN_DOM_FRAGMENT: true } & Record<string, unknown>): DocumentFragment
      (html: string, options?: Record<string, unknown>): string
    }
  }
  hljs?: { highlightElement: (element: HTMLElement) => void; getLanguage: (name: string) => unknown }
}

export function loadMarkdownRuntime() {
  return Promise.all([
    library("marked/15.0.12/lib/marked.umd.js"),
    library("dompurify/3.2.7/dist/purify.min.js"),
  ])
}
