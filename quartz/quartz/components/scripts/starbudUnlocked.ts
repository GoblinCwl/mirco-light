import { readContentCatalog } from "./contentCatalog"
import { sharedState } from "./sharedRequest"

export type StarbudReadRequest = {
  turn_id: string
  request_id: string
  action: "find_text" | "list_files" | "read_file"
  query?: string
  cursor?: number
  file_ref?: string
}
type ShareFile = { name: string; is_dir: boolean; size: number; read?: (signal: AbortSignal) => Promise<string> }
type SharePage = { href: string; pathname: string; files: ShareFile[]; text: () => string }
const sharePages = sharedState("starbud-share-page", () => new WeakMap<HTMLElement, SharePage>())
const chunkSize = 1800

export function setStarbudSharePage(root: HTMLElement, page?: Omit<SharePage, "pathname">) {
  if (page) sharePages.set(root, { ...page, pathname: location.pathname })
  else sharePages.delete(root)
}

export function readableStarbudFile(name: string, size: number) {
  return size <= 64 * 1024 && /(?:^|\.)(?:md|markdown|txt|log|csv|tsv|json|ya?ml|xml|toml|ini|cfg|sql|js|ts|py|go|java|rs|sh|css|html)$/i.test(name)
}

export async function readStarbudFile(url: string, signal: AbortSignal) {
  const response = await fetch(url, { credentials: "omit", cache: "no-store", signal })
  if (!response.ok || !response.body) throw Error("文件无法读取")
  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let size = 0
  let text = ""
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 64 * 1024) throw Error("文件过大")
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    if (text.includes("\0")) throw Error("文件不是文本")
    return text
  } finally {
    void reader.cancel().catch(() => {})
  }
}

function excerpt(text: string, cursor: number, query = "") {
  const chars = [...text.trim()]
  if (!chars.length) return { error: "当前内容没有可读取的文本" }
  const needle = query.trim().toLowerCase()
  if (needle) {
    const terms = [needle, ...needle.split(/\s+/)].filter(Boolean)
    const windows = Array.from({ length: Math.ceil(chars.length / 750) }, (_, i) => {
      const segment = chars.slice(Math.max(0, i * 750 - 100), (i + 1) * 750 + 100).join("")
      const lower = segment.toLowerCase()
      return { segment, score: terms.reduce((total, term) => total + Number(lower.includes(term)), 0) }
    })
    const snippets = windows.filter(item => item.score).sort((a, b) => b.score - a.score).slice(0, 2).map(item => item.segment)
    return snippets.length ? { text: snippets.join("\n…\n") } : { error: "未找到匹配文本，可调整关键词或按段读取" }
  }
  const next = cursor + chunkSize
  const end = Math.min(next, chars.length)
  return { text: chars.slice(cursor, end).join(""), ...(end < chars.length ? { next_cursor: end } : {}) }
}

export async function currentStarbudUnlock(signal: AbortSignal) {
  const pathname = location.pathname
  const article = document.querySelector<HTMLElement>("#content[data-starbud-unlocked]")
  const root = document.querySelector<HTMLElement>("[data-openlist]")
  const share = root && sharePages.get(root)
  const currentShare = share && share.pathname === pathname ? share : undefined
  if (!article && !currentShare) return
  const valid = () => !signal.aborted && location.pathname === pathname &&
    (currentShare ? !!root?.isConnected && sharePages.get(root) === currentShare :
      !!article?.isConnected && article.hasAttribute("data-starbud-unlocked"))
  const catalog = await readContentCatalog({ signal })
  if (!valid()) return
  const record = currentShare
    ? Object.values(catalog.pages).find(page => page.type === "share" && page.href.replace(/\/$/, "") === currentShare.href.replace(/\/$/, ""))
    : catalog.pages[document.body.dataset.slug || ""]
  if (!record?.id || !record.encrypted) return
  const refs = new Map<string, ShareFile>()
  return {
    descriptor: { work_id: record.id, unlocked: true },
    valid,
    async read(request: StarbudReadRequest, requestSignal: AbortSignal) {
      if (!valid()) return { error: "页面已切换或锁定" }
      const cursor = Math.max(0, Math.min(request.cursor || 0, 1000000))
      if (request.action === "find_text") {
        const text = currentShare ? currentShare.text() : article!.innerText
        return excerpt(text, cursor, request.query)
      }
      if (!currentShare) return { error: "当前文章没有分享文件列表" }
      if (request.action === "list_files") {
        const files = currentShare.files.slice(cursor, cursor + 30).map(file => {
          const file_ref = file.read ? crypto.randomUUID() : undefined
          if (file_ref) refs.set(file_ref, file)
          return { name: file.name.slice(0, 180), directory: file.is_dir, size: file.size, file_ref }
        })
        return { files, ...(cursor + files.length < currentShare.files.length ? { next_cursor: cursor + files.length } : {}) }
      }
      const file = request.file_ref && refs.get(request.file_ref)
      if (request.action !== "read_file" || !file || !file.read) return { error: "请先列出当前目录，再使用返回的文件标识读取文本文件" }
      const text = await file.read(requestSignal)
      if (!valid()) return { error: "页面已切换或锁定" }
      return excerpt(text, cursor, request.query)
    },
  }
}
