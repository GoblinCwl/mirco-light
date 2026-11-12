import { retainFavicon } from "./faviconPersistence"
import {retainShareGraph} from './shareGraphPersistence'
import { retainDirectory } from "./directoryPersistence"
import micromorph from "micromorph"
import { FullSlug, RelativeURL, getFullSlug, normalizeRelativeURLs } from "../../util/path"
import { fetchNavigationPage, SITE_NOT_FOUND_PATH } from "./util"

// adapted from `micromorph`
// https://github.com/natemoo-re/micromorph
const NODE_TYPE_ELEMENT = 1
let announcer = document.createElement("route-announcer")
const isElement = (target: EventTarget | null): target is Element =>
  (target as Node)?.nodeType === NODE_TYPE_ELEMENT
const isLocalUrl = (href: string) => {
  try {
    const url = new URL(href)
    if (window.location.origin === url.origin) {
      return true
    }
  } catch (e) {}
  return false
}

const isSamePage = (url: URL): boolean => {
  const sameOrigin = url.origin === window.location.origin
  const samePath = url.pathname === window.location.pathname
  return sameOrigin && samePath
}

const getOpts = ({ target }: Event): { url: URL; scroll?: boolean } | undefined => {
  if (!isElement(target)) return
  if (target.attributes.getNamedItem("target")?.value === "_blank") return
  const a = target.closest("a")
  if (!a) return
  if ("routerIgnore" in a.dataset) return
  const { href } = a
  if (!isLocalUrl(href)) return
  return { url: new URL(href), scroll: "routerNoscroll" in a.dataset ? false : undefined }
}

function notifyNav(url: FullSlug) {
  const event: CustomEventMap["nav"] = new CustomEvent("nav", { detail: { url } })
  document.dispatchEvent(event)
}

const cleanupFns: Set<(...args: any[]) => void> = new Set()
// @ts-ignore
window.addCleanup = (fn) => cleanupFns.add(fn)

let loadingTimer: ReturnType<typeof setTimeout> | undefined
function startLoading() {
  document.querySelectorAll(".navigation-progress").forEach(node=>node.remove())
  const loadingBar=document.createElement("div")
  loadingBar.className="navigation-progress";loadingBar.setAttribute("role","progressbar");loadingBar.setAttribute("aria-label","正在加载页面")
  loadingBar.style.width="12%"
  document.documentElement.append(loadingBar)
  clearTimeout(loadingTimer)
  loadingTimer=setTimeout(()=>{loadingBar.style.width="80%"},100)
  return loadingBar
}

let isNavigating = false
let p: DOMParser
async function _navigate(url: URL, isBack: boolean = false, source = url) {
  isNavigating = true
  const loadingBar=startLoading()
  p = p || new DOMParser()
  const contents = await fetchNavigationPage(source)
    .then((res) => {
      const contentType = res.headers.get("content-type")
      if (contentType?.startsWith("text/html")) {
        return res.text()
      } else {
        window.location.assign(url)
      }
    })
    .catch(() => {
      window.location.assign(url)
    })

  if (!contents) return

  const html = p.parseFromString(contents, "text/html")
  const restoreShareGraph = retainShareGraph(html,url)

  // Release the keyboard focus before retained controls are moved to the next page.
  const focused=document.activeElement
  if(focused instanceof HTMLElement&&focused.matches("input,textarea,select,[contenteditable='true']"))focused.blur()

  // notify about to nav
  const event: CustomEventMap["prenav"] = new CustomEvent("prenav", { detail: {} })
  document.dispatchEvent(event)

  // cleanup old
  cleanupFns.forEach((fn) => fn())
  cleanupFns.clear()

  const base = html.querySelector("base")?.getAttribute("href")
  normalizeRelativeURLs(html, base ? new URL(base, url) : url)

  let title = html.querySelector("title")?.textContent
  if (title) {
    document.title = title
  } else {
    const h1 = document.querySelector("h1")
    title = h1?.innerText ?? h1?.textContent ?? url.pathname
  }
  if (announcer.textContent !== title) {
    announcer.textContent = title
  }
  announcer.dataset.persist = ""
  html.body.appendChild(announcer)

  // Keep the context row visible; the destination replaces it only when its
  // final directory/file identity has been resolved.
  if (html.querySelector("[data-openlist]")) {
    const currentContext = document.querySelector<HTMLElement>("[data-drive-operation-context]:not([hidden])")
    const incomingContext = html.querySelector<HTMLElement>("[data-drive-operation-context]")
    if (currentContext && incomingContext) {
      incomingContext.replaceChildren(...[...currentContext.childNodes].map(node => node.cloneNode(true)))
      incomingContext.hidden = false
    }
  }

  // Keep the resolved media trail visible during navigation within its share.
  // The destination replaces it once its metadata names are ready.
  const media = document.querySelector<HTMLElement>(".drive-page.is-media-view[data-drive-share]")
  const currentTrail = document.querySelector<HTMLElement>(".center .breadcrumb-container[data-drive-breadcrumb-ready]")
  const incomingTrail = html.querySelector<HTMLElement>(".center .breadcrumb-container")
  if (media && html.querySelector("[data-openlist]")) {
    let destination = ""
    try { destination = decodeURIComponent(url.pathname) } catch {}
    const shareRoot = `/Share/分享/${media.dataset.driveShare}`
    if (destination === shareRoot || destination.startsWith(`${shareRoot}/`)) {
      const currentPoster = document.querySelector<HTMLElement>("[data-drive-media-poster]:not([hidden])")
      const incomingPoster = html.querySelector<HTMLElement>("[data-drive-media-poster]")
      if (currentPoster && incomingPoster && currentPoster.querySelector("img[src]:not([hidden])")) {
        let scope = ""
        try { scope = decodeURIComponent(currentPoster.dataset.drivePosterScope || "") } catch {}
        const base = scope.replace(/\/+$/, ""), target = destination.replace(/\/+$/, "")
        const reuse = Boolean(base && (target === base || target.slice(0, target.lastIndexOf("/")) === base))
        incomingPoster.replaceChildren(...[...currentPoster.childNodes].map(node => node.cloneNode(true)))
        incomingPoster.hidden = !reuse
        incomingPoster.dataset.drivePosterPending = ""
        incomingPoster.dataset.drivePosterReuse = String(reuse)
        if (currentPoster.dataset.drivePosterKey) incomingPoster.dataset.drivePosterKey = currentPoster.dataset.drivePosterKey
        if (scope) incomingPoster.dataset.drivePosterScope = currentPoster.dataset.drivePosterScope!
        const artwork = incomingPoster.querySelector<HTMLElement>(".drive-media-artwork")!
        const image = artwork.querySelector<HTMLImageElement>("img")!
        image.hidden = !reuse
        artwork.hidden = !reuse; artwork.classList.toggle("is-media-loading", false); artwork.setAttribute("aria-busy", "false")
        incomingPoster.querySelector<HTMLElement>("figcaption")!.inert = true
      }
    }
  }
  if (media && currentTrail && incomingTrail && html.querySelector("[data-openlist]")) {
    const shareRoot = `/Share/分享/${media.dataset.driveShare}`
    let destination = ""
    try { destination = decodeURIComponent(url.pathname) } catch { /* Invalid paths use their normal route handling. */ }
    if (destination === shareRoot || destination.startsWith(`${shareRoot}/`)) {
      incomingTrail.replaceChildren(...[...currentTrail.childNodes].map(node => node.cloneNode(true)))
      incomingTrail.dataset.driveBreadcrumbReady = ""
      incomingTrail.dataset.driveBreadcrumbRetained = ""
      const currentEpisodes = document.querySelector<HTMLElement>("[data-drive-episodes]:not([hidden])")
      const incomingEpisodes = html.querySelector<HTMLElement>("[data-drive-episodes]")
      const sameSeason = currentEpisodes && [...currentEpisodes.querySelectorAll<HTMLAnchorElement>("[data-drive-episode-list] a")].some(link => new URL(link.href).pathname === url.pathname)
      if (currentEpisodes && sameSeason && incomingEpisodes) {
        incomingEpisodes.replaceChildren(...[...currentEpisodes.childNodes].map(node => node.cloneNode(true)))
        incomingEpisodes.hidden = false
        incomingEpisodes.dataset.driveEpisodesRetained = ""
        incomingEpisodes.dataset.driveEpisodeProgram = currentEpisodes.dataset.driveEpisodeProgram || ""
        incomingEpisodes.dataset.driveEpisodeSeason = currentEpisodes.dataset.driveEpisodeSeason || ""
        const list = incomingEpisodes.querySelector<HTMLElement>("[data-drive-episode-list]")!
        list.dataset.driveEpisodeScroll = String(currentEpisodes.querySelector<HTMLElement>("[data-drive-episode-list]")!.scrollTop)
        for (const link of list.querySelectorAll<HTMLAnchorElement>("a")) {
          if (new URL(link.href).pathname === url.pathname) link.setAttribute("aria-current", "page")
          else link.removeAttribute("aria-current")
        }
        const operations = incomingEpisodes.closest<HTMLElement>("[data-drive-operations]")!
        operations.classList.add("has-episode-picker")
        const currentLaunch = document.querySelector<HTMLElement>("[data-drive-operations-launch]")!
        const incomingLaunch = operations.querySelector<HTMLElement>("[data-drive-operations-launch]")!
        incomingLaunch.replaceChildren(...[...currentLaunch.childNodes].map(node => node.cloneNode(true)))
        incomingLaunch.hidden = currentLaunch.hidden
        incomingLaunch.dataset.icon = currentLaunch.dataset.icon || "episodes"
      }
      const currentHeading = document.querySelector<HTMLElement>(".center .article-title:not([aria-busy='true'])")
      const incomingHeading = html.querySelector<HTMLElement>(".center .article-title")
      if (currentHeading && incomingHeading) {
        incomingHeading.replaceChildren(...[...currentHeading.childNodes].map(node => node.cloneNode(true)))
        incomingHeading.style.visibility = ""
        incomingHeading.dataset.driveTitleRetained = ""
      }
    }
  }

  // Only the directory survives. All page-specific containers are still morphed.
  const restoreDirectory = retainDirectory(html)
  try { await micromorph(document.body, html.body) }
  finally { restoreDirectory(); restoreShareGraph() }

  // scroll into place and add history
  if (!isBack) {
    if (url.hash) {
      const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
      el?.scrollIntoView()
    } else {
      window.scrollTo({ top: 0 })
    }
  }

  // Keep the favicon mounted; removing it makes the browser fall back to its
  // cached tab icon before it loads the very same image again.
  retainFavicon(document, html)
  // now, patch head, re-executing scripts
  const elementsToRemove = document.head.querySelectorAll(":not([data-persist])")
  elementsToRemove.forEach((el) => el.remove())
  const elementsToAdd = html.head.querySelectorAll(":not([data-persist])")
  elementsToAdd.forEach((el) => document.head.appendChild(el))

  // delay setting the url until now
  // at this point everything is loaded so changing the url should resolve to the correct addresses
  if (!isBack) {
    history.pushState({}, "", url)
  }

  loadingBar.style.width="100%"
  clearTimeout(loadingTimer)
  loadingTimer=setTimeout(()=>loadingBar.remove(),180)
  notifyNav(getFullSlug(window))
  delete announcer.dataset.persist
}

async function navigate(url: URL, isBack: boolean = false, source = url) {
  if (isNavigating) return
  isNavigating = true
  try {
    await _navigate(url, isBack, source)
  } catch (e) {
    console.error(e)
    window.location.assign(url)
  } finally {
    isNavigating = false
  }
}

// Dynamic route misses render the dedicated site 404 and retain the requested
// URL, navigation sidebar and current history entry.
document.addEventListener("quartz-not-found", () => {
  const requested = location.href
  const render = () => {
    if (location.href !== requested) return
    if (isNavigating) { requestAnimationFrame(render); return }
    void navigate(new URL(requested), true, new URL(SITE_NOT_FOUND_PATH, location.origin))
  }
  requestAnimationFrame(render)
})

// @ts-ignore
window.spaNavigate = navigate

function createRouter() {
  if (typeof window !== "undefined") {
    window.addEventListener("click", async (event) => {
      const { url } = getOpts(event) ?? {}
      // dont hijack behaviour, just let browser act normally
      if (!url || event.ctrlKey || event.metaKey) return
      event.preventDefault()

      if (isSamePage(url) && url.hash) {
        const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
        el?.scrollIntoView()
        history.pushState({}, "", url)
        return
      }

      navigate(url, false)
    })

    window.addEventListener("popstate", (event) => {
      const { url } = getOpts(event) ?? {}
      if (window.location.hash && window.location.pathname === url?.pathname) return
      navigate(new URL(window.location.toString()), true)
      return
    })
  }

  return new (class Router {
    go(pathname: RelativeURL) {
      const url = new URL(pathname, window.location.toString())
      return navigate(url, false)
    }

    back() {
      return window.history.back()
    }

    forward() {
      return window.history.forward()
    }
  })()
}

createRouter()
notifyNav(getFullSlug(window))

if (!customElements.get("route-announcer")) {
  const attrs = {
    "aria-live": "assertive",
    "aria-atomic": "true",
    style:
      "position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px",
  }

  customElements.define(
    "route-announcer",
    class RouteAnnouncer extends HTMLElement {
      constructor() {
        super()
      }
      connectedCallback() {
        for (const [key, value] of Object.entries(attrs)) {
          this.setAttribute(key, value)
        }
      }
    },
  )
}
