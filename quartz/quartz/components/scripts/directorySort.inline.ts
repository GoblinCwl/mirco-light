type SortKey = "name" | "modified" | "language" | "source"
type SortColumn = { key: SortKey; direction: number }

document.addEventListener("nav", () => {
  const states = new WeakMap<HTMLTableElement, SortColumn[]>()
  const initialColumns = (table: HTMLTableElement): SortColumn[] => {
    const key = table.dataset.directoryInitialSort
    return [{ key: key === "source" ? "source" : key === "modified" ? "modified" : "name", direction: key === "modified" ? -1 : 1 }]
  }
  const click = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-directory-sort]") : null
    const table = button?.closest<HTMLTableElement>("table[data-directory-list]")
    if (!button || !table) return
    const key = button.dataset.directorySort as SortKey
    if (!["name", "modified", "language"].includes(key)) return
    event.preventDefault()
    let columns = states.get(table) || initialColumns(table)
    const old = columns.find(column => column.key === key)
    const next = { key, direction: old ? -old.direction : key === "modified" ? -1 : 1 }
    columns = event.shiftKey ? old ? columns.map(column => column.key === key ? next : column) : [...columns, next] : [next]
    states.set(table, columns)
    sortTable(table, columns)
  }
  const sortTable = (table: HTMLTableElement, columns: SortColumn[]) => {
    const body = table.tBodies[0]
    const rows = Array.from(body.rows)
    rows.sort((a, b) => {
      const folder = Number(b.dataset.directoryFolder === "true") - Number(a.dataset.directoryFolder === "true")
      if (folder) return folder
      for (const column of columns) {
        let result: number
        if (column.key === "source") result = Number(a.dataset.directoryOrder || 0) - Number(b.dataset.directoryOrder || 0)
        else if (column.key === "modified") {
          const left = a.dataset.directoryModified, right = b.dataset.directoryModified
          // Missing timestamps stay last in either direction.
          if (!left !== !right) return left ? -1 : 1
          result = Number(left || 0) - Number(right || 0)
        } else {
          const field = column.key === "language" ? "directoryLanguage" : "directoryName"
          result = (a.dataset[field] || "").localeCompare(b.dataset[field] || "", "zh-CN", { numeric: true })
        }
        if (result) return result * column.direction
      }
      return (a.dataset.directoryName || "").localeCompare(b.dataset.directoryName || "", "zh-CN", { numeric: true })
    })
    body.append(...rows)
    for (const control of table.querySelectorAll<HTMLButtonElement>("[data-directory-sort]")) {
      const index = columns.findIndex(column => column.key === control.dataset.directorySort), column = columns[index], header = control.closest("th")!
      header.removeAttribute("aria-sort")
      if (index === 0) header.setAttribute("aria-sort", column.direction === 1 ? "ascending" : "descending")
      control.classList.toggle("is-sorted", index >= 0)
      control.querySelector(".drive-sort-indicator")!.textContent = column ? `${column.direction === 1 ? "↑" : "↓"}${columns.length > 1 ? index + 1 : ""}` : "↕"
    }
  }
  const updated = (event: Event) => {
    if (!(event.target instanceof HTMLTableElement)) return
    const table = event.target
    sortTable(table, states.get(table) || initialColumns(table))
  }
  document.addEventListener("click", click)
  document.addEventListener("directory-list-updated", updated)
  window.addCleanup(() => { document.removeEventListener("click", click); document.removeEventListener("directory-list-updated", updated) })
})
