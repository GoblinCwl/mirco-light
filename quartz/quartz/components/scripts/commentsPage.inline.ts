import { createInfiniteScroll } from "./infiniteScroll"
import { bindIdenticon } from "./identicon"
import { commentContent, safeUrl } from "./commentContent"

type PublicComment = {
  id: number; name: string; avatar: string; avatarSeed?: string; isAdmin?: boolean; content: string; createdAt: string | null
  replyTo: number | null; pageTitle: string; url: string
  replyTarget?: { id: number; name: string; isAdmin: boolean; url: string }
}

document.addEventListener("nav", () => {
  const root = document.querySelector<HTMLElement>("[data-all-comments]")
  if (!root) return
  const list = root.querySelector<HTMLElement>("[data-comments-list]")!
  const status = root.querySelector<HTMLElement>("[data-comments-status]")!
  const summary = root.querySelector<HTMLElement>("[data-comments-summary]")!
  const pagination = root.querySelector<HTMLElement>("[data-comments-pagination]")!
  const moreStatus = root.querySelector<HTMLElement>("[data-comments-more-status]")!
  const retry = root.querySelector<HTMLButtonElement>("[data-comments-retry]")!
  const controller = new AbortController()
  let currentPage = 0, hasMore = false, failed = false
  const seen = new Set<number>()
  const paging = createInfiniteScroll(pagination, () => load(currentPage + 1), { signal: controller.signal })
  let loading = false
  const load = async (page: number) => {
    if (loading) return
    loading = true
    list.setAttribute("aria-busy", "true")
    status.hidden = page > 1
    status.textContent = "正在加载评论…"
    moreStatus.textContent = page > 1 ? "正在加载评论…" : ""
    pagination.hidden = page <= 1
    paging.setEnabled(false); failed = false
    retry.hidden = true
    try {
      const response = await fetch(`/api/comments?page=${page}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
      if (!response.ok) throw new Error("Comments unavailable")
      const data: { comments: PublicComment[]; total: number; pageSize: number } = await response.json()
      if (!Array.isArray(data.comments) || !Number.isSafeInteger(data.total) || data.pageSize !== 20) throw new Error("Invalid comments")
      if (!root.isConnected || controller.signal.aborted) return
      if (page === 1) { list.replaceChildren(); seen.clear() }
      for (const comment of data.comments) {
        if (seen.has(comment.id)) continue
        seen.add(comment.id)
        const item = document.createElement("article")
        item.className = "comments-item"
        const avatar = document.createElement("div")
        avatar.className = "comments-avatar"
        avatar.textContent = Array.from(comment.name)[0] ?? "访"
        const avatarSeed = comment.avatarSeed || comment.avatar?.match(/\/avatar\/([a-f\d]{32,64})/i)?.[1]?.toLowerCase() || comment.name
        {
          const image = document.createElement("img")
          image.alt = comment.name; image.loading = "lazy"
          image.referrerPolicy = "no-referrer"
          image.setAttribute("no-view", "")
          bindIdenticon(image, comment.name, avatarSeed, comment.isAdmin)
          avatar.append(image)
        }
        const body = document.createElement("div")
        body.className = "comments-item-body"
        const header = document.createElement("div")
        header.className = "comments-item-header"
        const name = document.createElement("strong")
        name.textContent = comment.name
        if (comment.isAdmin) name.classList.add("comment-admin-name")
        const date = document.createElement("time")
        if (comment.createdAt && Number.isFinite(Date.parse(comment.createdAt))) {
          date.dateTime = comment.createdAt
          date.textContent = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(comment.createdAt))
        }
        header.append(name, date)
        if (comment.replyTo) {
          const reply = document.createElement("span")
          reply.className = "comments-reply"
          reply.textContent = "回复"
          if (comment.replyTarget) {
            reply.append(" · ")
            const target = document.createElement("span")
            target.className = "comments-reply-target"
            if (comment.replyTarget.isAdmin) target.classList.add("comment-admin-name")
            target.textContent = comment.replyTarget.name
            reply.append(target)
          } else reply.textContent = "回复 · 原评论暂不可见"
          header.append(reply)
        }
        const content = document.createElement("div")
        content.className = "comments-content"
        content.append(commentContent(comment.content))
        const source = document.createElement("a")
        source.className = "comments-source"
        const href = safeUrl(comment.url)
        if (href) source.href = href
        source.target = "_blank"; source.rel = "noopener noreferrer"
        source.textContent = `来自 · ${comment.pageTitle}`
        source.title = "查看原文中的这条评论"
        body.append(header, content, source)
        item.append(avatar, body)
        list.append(item)
      }
      summary.textContent = `共 ${data.total} 条公开评论`
      status.hidden = page > 1 || data.comments.length > 0
      status.textContent = data.total === 0 ? "还没有公开评论。" : "这一页暂无评论。"
      hasMore = page * data.pageSize < data.total && data.comments.length > 0
      pagination.hidden = !hasMore; moreStatus.textContent = ""
      currentPage = page

    } catch {
      if (!controller.signal.aborted) {
        failed = true; pagination.hidden = false
        if (currentPage) { moreStatus.textContent = "评论暂时无法加载。"; status.hidden = true }
        else { status.hidden = false; status.textContent = "评论暂时无法加载。" }
        retry.hidden = false
      }
    } finally { loading = false; list.setAttribute("aria-busy", "false"); if (!controller.signal.aborted) paging.setEnabled(hasMore && !failed) }
  }
  const onRetry = () => void load(currentPage + 1)
  retry.addEventListener("click", onRetry)
  const url = new URL(location.href); url.searchParams.delete("page"); history.replaceState(history.state, "", url)
  void load(1)
  window.addCleanup(() => { controller.abort(); retry.removeEventListener("click", onRetry) })
})
