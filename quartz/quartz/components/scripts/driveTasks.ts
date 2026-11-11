import { driveRequest, driveToken } from "./driveClient"
import { node } from "./driveUi"

type Task = { id: string; name?: string; state?: number; progress?: number; error?: string }
export function setupDriveTaskMonitor(signal: AbortSignal, refresh: () => Promise<unknown>) {
  const host = document.querySelector<HTMLElement>(".drive-operations-inner")!
  const section = node("section", "", "drive-operation-tasks"), title = node("strong", "后台任务"), rows = node("div")
  section.hidden = true; section.append(title, rows); host.append(section)
  document.addEventListener("drive-auth-change", () => { rows.replaceChildren(); section.hidden = true }, { signal })
  return (category: string, tasks: Task[], token: string) => {
    section.hidden = false
    for (const task of tasks) {
      const row = node("p", `${task.name || "任务"} · 已提交`); rows.prepend(row)
      const poll = async () => {
        if (signal.aborted || driveToken() !== token) return
        try {
          const current = await driveRequest<Task>(`task/${category}/info?tid=${encodeURIComponent(task.id)}`, {}, { token, signal })
          if (signal.aborted || driveToken() !== token) return
          const done = current.state === 2, failed = current.state === 4 || current.state === 7
          row.textContent = `${current.name || task.name || "任务"} · ${done ? "已完成" : failed ? current.error || "已取消或失败" : `${Math.round(current.progress || 0)}%`}`
          row.classList.toggle("is-error", failed)
          if (done || failed) { await refresh(); return }
          schedule()
        } catch (error) { if (!signal.aborted) row.textContent = `任务已提交，暂时无法获取进度；可刷新目录查看。${error instanceof Error ? error.message : ""}` }
      }
      const schedule = () => {
        const abort = () => window.clearTimeout(timer)
        const timer = window.setTimeout(() => { signal.removeEventListener("abort", abort); void poll() }, 2000)
        signal.addEventListener("abort", abort, { once: true })
      }
      schedule()
    }
  }
}
