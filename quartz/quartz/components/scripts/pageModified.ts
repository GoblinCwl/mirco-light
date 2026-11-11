import { formatDateWithSeconds } from "../../util/formatDate"

export function latestPageDate(values: (string | null | undefined)[]): string | null {
  const timestamps = values.map(value => value ? Date.parse(value) : NaN).filter(Number.isFinite)
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
}

// Fill the same CustomContentMeta placeholder used by Drive and articles.
export function setPageModified(container: ParentNode, value?: string | null) {
  const meta = container.querySelector<HTMLElement>("[data-page-modified]")
  const time = meta?.querySelector<HTMLTimeElement>("time")
  if (!meta || !time) return
  const date = value ? new Date(value) : undefined
  if (!date || !Number.isFinite(date.getTime())) {
    meta.hidden = true; time.textContent = ""; time.removeAttribute("datetime")
    return
  }
  const iso = date.toISOString()
  if (time.dateTime !== iso) {
    time.dateTime = iso
    time.textContent = formatDateWithSeconds(date, meta.dataset.locale, true)
  }
  meta.hidden = false
}
