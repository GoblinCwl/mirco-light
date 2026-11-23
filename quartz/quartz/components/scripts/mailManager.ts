import { showAdminListLoading, showAdminListMessage } from "./adminListState"
import { renderAdminPagination } from "./adminPagination"
import { node } from "./driveUi"
import { showPasswordToast } from "./passwordFeedback"

type Delivery = {
  id: string
  recipient: string
  name: string
  title: string
  state: "pending" | "sent" | "failed"
  attempts: number
  createdAt: string
  error: string
  smtpCode?: number
  canRetry: boolean
}

type DeliveryPage = { items: Delivery[]; page: number; pageSize: number; total: number }

const stateLabels = { pending: "待投递", sent: "已交给发信服务器", failed: "投递失败" }

export function setupMailManager(
  root: HTMLElement,
  signal: AbortSignal,
  request: (path: string, init?: RequestInit) => Promise<DeliveryPage | { ok: boolean }>,
) {
  const toolbar = node("div", "", "data-admin-toolbar mail-admin-toolbar")
  const filter = node("select")
  filter.setAttribute("aria-label", "投递状态")
  filter.append(new Option("全部状态", ""), ...Object.entries(stateLabels).map(([value, title]) => new Option(title, value)))
  const refresh = node("button", "刷新", "stellar-action-button")
  refresh.type = "button"
  toolbar.append(filter, refresh)
  const list = node("div", "", "feedback-admin-list")
  list.setAttribute("aria-label", "邮件投递记录")
  const footer = node("div", "", "stellar-admin-pagination")
  root.append(toolbar, list, footer)

  let page = 1
  let revision = 0
  const load = async (next = page) => {
    if (signal.aborted) return
    const own = ++revision
    refresh.disabled = true
    footer.replaceChildren()
    showAdminListLoading(list)
    try {
      const query = new URLSearchParams({ state: filter.value, page: String(next) })
      const result = await request(`/admin/mail?${query}`) as DeliveryPage
      if (signal.aborted || own !== revision) return
      page = result.page
      list.replaceChildren()
      if (!result.items.length) {
        showAdminListMessage(list, "暂无邮件记录", "")
        return
      }
      for (const item of result.items) {
        const card = node("section", "", "feedback-admin-item")
        const header = node("header")
        const copy = node("div", "", "friend-admin-copy")
        const status = node("span", stateLabels[item.state], "stellar-admin-badge")
        status.dataset.state = item.state === "failed" ? "已失效" : item.state === "pending" ? "待处理" : "已发送"
        copy.append(node("strong", item.name ? `${item.title} · ${item.name}` : item.title))
        header.append(copy, status)
        if (item.canRetry) {
          const actions = node("div", "", "feedback-admin-actions")
          const retry = node("button", "重试")
          retry.type = "button"
          retry.addEventListener("click", async () => {
            retry.disabled = true
            try {
              await request(`/admin/mail/retry/${encodeURIComponent(item.id)}`, { method: "POST" })
              if (signal.aborted) return
              showPasswordToast("邮件已重新入队")
              await load()
            } catch (error) {
              if (!signal.aborted) showPasswordToast(error instanceof Error ? error.message : "重试失败", true)
            } finally {
              retry.disabled = false
            }
          }, { signal })
          actions.append(retry)
          header.append(actions)
        }
        const date = new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })
        const meta = [item.recipient, date, `尝试 ${item.attempts} 次`]
        if (item.smtpCode && !item.error) meta.push(`SMTP ${item.smtpCode}`)
        card.append(header, node("p", meta.join(" · "), "feedback-admin-meta"))
        if (item.error) card.append(node("p", item.error, "feedback-admin-meta mail-admin-error"))
        list.append(card)
      }
      renderAdminPagination(footer, page, Math.ceil(result.total / result.pageSize), result.total, value => void load(value))
    } catch (error) {
      if (!signal.aborted && own === revision) {
        showAdminListMessage(list, "邮件记录加载失败", error instanceof Error ? error.message : "请稍后重试", () => void load(next))
      }
    } finally {
      if (own === revision) {
        refresh.disabled = false
        list.removeAttribute("aria-busy")
      }
    }
  }
  filter.addEventListener("change", () => void load(1), { signal })
  refresh.addEventListener("click", () => void load(), { signal })
  const refreshList = () => void load()
  refreshList()
  return refreshList
}
