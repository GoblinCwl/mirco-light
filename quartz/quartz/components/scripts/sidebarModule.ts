import { escapeHTML } from "../../util/escape"

// Body is already rendered markup; titles and class names are always escaped.
export function sidebarModule(title: string, body: string, className: string, headingClass: string) {
  return `<section class="${escapeHTML(className)}"><div class="${escapeHTML(headingClass)}">${escapeHTML(title)}</div>${body}</section>`
}
