import { showAdminListLoading, showAdminListMessage } from "./adminListState"
import { renderAdminPagination } from "./adminPagination"
import { driveActionDialog } from "./driveActionDialog"
import { node } from "./driveUi"
import { showPasswordToast } from "./passwordFeedback"
import { preloadStarbudMarkdown, renderStarbudMarkdown } from "./starbudMarkdown"

type Conversation = { id: string; ip: string; ip_source: string; last_seen: string; turns: number }
type Turn = { created_at: string; page_url: string; question: string; answer: string | null; status: string }
type Page<T> = { items: T[]; page: number; pages: number; total: number }
type Request = (path: string, init?: RequestInit) => Promise<any>

const endpoint = "/admin/starbud/conversations"
const date = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
})

function button(label: string, click: () => void) {
  const element = node("button", label)
  element.type = "button"
  element.onclick = click
  return element
}

export function setupStarbudManager(root: HTMLElement, signal: AbortSignal, request: Request) {
  const header = node("div", "", "friend-admin-heading")
  const body = node("div", "", "starbud-admin-body")
  const footer = node("div", "", "stellar-admin-pagination")
  root.append(header, body, footer)
  let conversation: Conversation | undefined
  let listPage = 1
  let turnPage = 1
  let revision = 0

  const remove = (item: Conversation) => {
    const dialog = driveActionDialog("删除会话", signal)
    dialog.note(`确认删除该浏览器的 ${item.turns} 次对话记录？`)
    dialog.submit.textContent = "确认删除"
    dialog.submit.classList.add("is-danger")
    dialog.run(async () => {
      await request(`${endpoint}?id=${encodeURIComponent(item.id)}`, { method: "DELETE" })
      if (signal.aborted) return
      if (conversation?.id === item.id) conversation = undefined
      await load()
      showPasswordToast("对话记录已删除")
    })
  }

  const showList = (result: Page<Conversation>) => {
    const wrap = node("div", "", "data-admin-table-wrap")
    const table = node("table", "", "data-admin-table starbud-admin-table")
    const titles = node("tr")
    for (const label of ["IP 地址", "最近对话", "对话次数", "操作"]) titles.append(node("th", label))
    const head = node("thead")
    head.append(titles)
    const rows = node("tbody")
    for (const item of result.items) {
      const row = node("tr")
      const actions = node("td", "", "data-admin-row-actions")
      const open = button("查看", () => {
        conversation = item
        void preloadStarbudMarkdown()
        turnPage = 1
        void load()
      })
      const deletion = button("删除", () => remove(item))
      deletion.classList.add("is-danger")
      actions.append(open, deletion)
      const ip = node("td")
      const address = node("span", item.ip || "—")
      if (item.ip_source === "visitor") address.title = "彗星最近记录的 IP"
      ip.append(address)
      row.append(ip, node("td", date.format(new Date(item.last_seen))), node("td", String(item.turns)), actions)
      rows.append(row)
    }
    table.append(head, rows)
    wrap.append(table)
    if (result.total) body.replaceChildren(wrap)
    else showAdminListMessage(body, "暂无对话", "")
  }

  const showTurns = (result: Page<Turn>) => {
    if (!result.total) {
      showAdminListMessage(body, "暂无对话", "")
      return
    }
    const transcript = node("div", "", "starbud-admin-transcript")
    for (const turn of result.items) {
      const section = node("section")
      const details = node("div", "", "starbud-admin-turn-meta")
      details.append(node("time", date.format(new Date(turn.created_at))), node("span", turn.page_url))
      const question = node("div", "", "starbud-admin-message is-visitor")
      question.append(node("strong", "访客"), node("p", turn.question))
      const answer = node("div", "", "starbud-admin-message")
      answer.append(node("strong", "星芽"))
      if (turn.answer) {
        const reply = node("div")
        answer.append(reply)
        renderStarbudMarkdown(reply, turn.answer)
        if (turn.status !== "已回复") answer.append(node("small", turn.status))
      } else answer.append(node("p", turn.status))
      section.append(details, question, answer)
      transcript.append(section)
    }
    body.replaceChildren(transcript)
  }

  const load = async () => {
    const selected = conversation
    const ticket = ++revision
    header.replaceChildren(node("h3", selected?.ip || (selected ? "聊天记录" : "对话列表")))
    if (selected) header.append(button("返回列表", () => { conversation = undefined; void load() }))
    else header.append(button("刷新", () => void load()))
    showAdminListLoading(body)
    footer.replaceChildren()
    try {
      const page = selected ? turnPage : listPage
      const query = new URLSearchParams({ page: String(page) })
      if (selected) query.set("id", selected.id)
      const result = await request(`${endpoint}?${query}`)
      if (signal.aborted || ticket !== revision) return
      if (selected) {
        turnPage = result.page
        showTurns(result)
        renderAdminPagination(footer, turnPage, result.pages, result.total, page => {
          turnPage = page
          void load()
        })
      } else {
        listPage = result.page
        showList(result)
        renderAdminPagination(footer, listPage, result.pages, result.total, page => {
          listPage = page
          void load()
        })
      }
    } catch {
      if (!signal.aborted && ticket === revision) showAdminListMessage(body, "读取失败", "暂时无法加载聊天记录。", () => void load())
    } finally {
      if (ticket === revision) body.removeAttribute("aria-busy")
    }
  }

  void load()
  return load
}
