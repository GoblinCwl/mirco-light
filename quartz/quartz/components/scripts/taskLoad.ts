import { node } from "./driveUi"

type Amount = { starts: number; estimatedMs: number; unknownStarts: number }
type LoadTask = Amount & { key: string; name: string; samples: number }
export type TaskLoad = { days: string[]; hours: Amount[][]; tasks: LoadTask[] }

const count = new Intl.NumberFormat("zh-CN")
const elapsed = (ms: number) => {
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)} 小时`
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)} 分钟`
  return `${(ms / 1000).toFixed(1)} 秒`
}

export function taskLoadWidget() {
  const element = node("section", "", "stellar-setting-card task-load")
  const header = node("header")
  const controls = node("div", "", "task-load-controls")
  const figure = node("div", "", "task-load-figure")
  const summary = node("p", "", "task-load-summary")
  const contributions = node("ul", "", "task-load-contributions")
  const starts = node("button", "触发次数")
  const duration = node("button", "估算耗时")
  starts.type = duration.type = "button"
  controls.append(starts, duration)
  header.append(node("h4", "周期任务负载"), controls)
  element.append(header, summary, figure, contributions)
  let data: TaskLoad | undefined, signature = ""
  let metric: "starts" | "estimatedMs" = "starts"

  const render = () => {
    if (!data) return
    starts.setAttribute("aria-pressed", String(metric === "starts"))
    duration.setAttribute("aria-pressed", String(metric === "estimatedMs"))
    const format = (amount: number) => metric === "starts" ? `${count.format(amount)} 次` : elapsed(amount)
    const values = data.hours.flat().map(cell => cell[metric])
    const maximum = Math.max(0, ...values)
    const minimum = Math.min(maximum, ...values.filter(value => value > 0))
    const peak = values.indexOf(maximum)
    const peakHour = String(peak % 24).padStart(2, "0") + ":00"
    const total = data.tasks.reduce((sum, task) => sum + task[metric], 0)
    const missing = data.tasks.filter(task => task.unknownStarts > 0).length
    summary.textContent = `今日起 7 天 · 合计 ${format(total)}`
      + (maximum > 0 ? ` · 峰值 ${data.days[Math.floor(peak / 24)].slice(5)} ${peakHour}（${format(maximum)}）` : "")
      + (metric === "estimatedMs" && missing ? ` · ${missing} 个任务缺少耗时样本` : "")

    const table = node("table")
    table.setAttribute("aria-label", metric === "starts" ? "每小时计划触发次数" : "每小时估算任务耗时")
    const head = node("thead"), heading = node("tr"), first = node("th", "日期")
    first.scope = "col"
    heading.append(first)
    for (let hour = 0; hour < 24; hour += 3) {
      const label = node("th", String(hour).padStart(2, "0"))
      label.scope = "colgroup"
      label.colSpan = 3
      heading.append(label)
    }
    head.append(heading)
    const body = node("tbody")
    data.hours.forEach((hours, index) => {
      const row = node("tr"), label = node("th", data!.days[index].slice(5))
      label.scope = "row"
      row.append(label)
      hours.forEach((hour, index) => {
        const cell = node("td"), mark = node("span")
        const value = hour[metric]
        const intensity = !value ? 0 : maximum === minimum ? 55 : 20 + 70 * (value - minimum) / (maximum - minimum)
        mark.style.setProperty("--task-heat", `${intensity}%`)
        if (metric === "estimatedMs" && hour.unknownStarts) mark.classList.add("has-unknown")
        cell.title = `${label.textContent} ${String(index).padStart(2, "0")}:00 · ${format(value)}`
          + (metric === "estimatedMs" && hour.unknownStarts ? ` · 另有 ${count.format(hour.unknownStarts)} 次缺少样本` : "")
        cell.setAttribute("aria-label", cell.title)
        cell.append(mark)
        row.append(cell)
      })
      body.append(row)
    })
    table.append(head, body)
    figure.replaceChildren(table)

    const leading = [...data.tasks].filter(task => task[metric] > 0).sort((a, b) => b[metric] - a[metric]).slice(0, 4)
    contributions.replaceChildren(...leading.map(task => {
      const item = node("li")
      item.append(node("span", task.name), node("strong", format(task[metric])))
      return item
    }))
    contributions.hidden = !leading.length
    element.title = metric === "estimatedMs" ? "按各任务最近完成记录的平均耗时估算" : ""
  }

  starts.onclick = () => { metric = "starts"; render() }
  duration.onclick = () => { metric = "estimatedMs"; render() }
  return { element, update(value: TaskLoad) {
    const next = JSON.stringify(value)
    if (signature === next) return
    data = value
    signature = next
    render()
  } }
}
