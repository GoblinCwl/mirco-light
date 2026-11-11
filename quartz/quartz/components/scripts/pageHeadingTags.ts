import { slugTag } from "../../util/path"
import { tagHref } from "./shareContent"

export function setPageHeadingTags(center: ParentNode, values: readonly string[]) {
  const heading = center.querySelector<HTMLElement>(".article-title")
  let list = center.querySelector<HTMLUListElement>("[data-page-heading-tags]")
  const tags = [...new Map(values.filter(Boolean).map(label => [slugTag(label), label])).entries()].filter(([tag]) => tag)
  if (!heading || !tags.length) { list?.remove(); return }
  if (!list) {
    list = document.createElement("ul")
    list.className = "tags"
    list.dataset.pageHeadingTags = ""
    const anchor = center.querySelector<HTMLElement>("[data-page-modified]") || heading
    anchor.after(list)
  }
  const signature = JSON.stringify(tags)
  if (list.dataset.tags === signature) return
  const items = tags.map(([tag,label]) => {
    const item = document.createElement("li"), link = document.createElement("a")
    link.className = "internal tag-link"
    link.href = tagHref(tag)
    link.textContent = label
    link.dataset.noPopover = "true"
    item.append(link)
    return item
  })
  list.replaceChildren(...items)
  list.dataset.tags = signature
}
