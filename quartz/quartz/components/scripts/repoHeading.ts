import {peekContentCatalog} from './contentCatalog'
import { setPageHeadingTags } from "./pageHeadingTags"
import { repoHref, repoRoute, type RepoInfo } from "./repoShared"
import { setPageModified } from "./pageModified"

// Use the actual site heading nodes, including title-link copying and the
// breadcrumb observer's overflow/append animations.
export function updateRepoHeading(info?: Pick<RepoInfo, "name" | "fork" | "language" | "pushed_at">) {
  const route = repoRoute(new URL(location.href)), center = document.querySelector(".center")
  if (!center) return
  setPageModified(center, route.name ? info?.pushed_at : null)
  const crumbs = [{ name: "Home", href: "/" }, { name: "Repo", href: "/Repo/" }]
  if (route.language && !route.name) crumbs.push({ name: route.language, href: repoHref("", { language: route.language }) })
  if (route.name) {
    const language = info?.language
    if (language) crumbs.push({ name: language, href: repoHref("", { language }) })
    crumbs.push({ name: info?.name || route.name, href: repoHref(route.name, { ref: route.ref || undefined }) })

  }
  const trail = center.querySelector<HTMLElement>(".breadcrumb-container")
  if (trail) {
    const fragment = document.createDocumentFragment()
    crumbs.forEach((crumb, index) => {
      const item = document.createElement("div"), anchor = document.createElement("a")
      item.className = "breadcrumb-element"; anchor.href = crumb.href; anchor.textContent = crumb.name; anchor.dataset.noPopover = "true"
      if (index === crumbs.length - 1) anchor.setAttribute("aria-current", "page")
      item.append(anchor)
      if (index !== crumbs.length - 1) { const spacer = document.createElement("p"); spacer.textContent = " ❯ "; item.append(spacer) }
      fragment.append(item)
    })
    const before = [...trail.childNodes], after = [...fragment.childNodes]
    if (before.length !== after.length || before.some((node, index) => !node.isEqualNode(after[index]))) trail.replaceChildren(fragment)
  }
  const name = route.name ? info?.name || route.name : route.language || ""
  const title = route.name ? name : name ? `星域: Repo/${name}` : "星域: Repo"
  const copy = center.querySelector<HTMLElement>(".article-title-copy")
  if (copy) {
    const text = [...copy.childNodes].find(child => child.nodeType === Node.TEXT_NODE)
    if (text) text.textContent = title
    copy.setAttribute("aria-label", `复制文章链接：${title}`)
    const heading = copy.closest("h1")!
    let fork = heading.querySelector<HTMLElement>(":scope > .repo-title-tag")
    if (info?.fork && !fork) {
      fork = document.createElement("span"); fork.className = "repo-title-tag"; fork.textContent = "Fork"
      heading.insertBefore(fork, copy)
    } else if (!info?.fork) fork?.remove()
  }
  setPageHeadingTags(center, route.name ? peekContentCatalog()?.pages[`Repo/${info?.name||route.name}`]?.tags || (info?.language?[info.language]:[]) : [])
  document.title = `${title} · 微光集`
  center.querySelector<HTMLElement>(".article-title")?.style.setProperty("visibility", "visible")
}
