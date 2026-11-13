import {createDirectoryDetailsMotion} from './directoryDetailsMotion'
import {readArticleIndex} from './contentCatalog'
import {setupMobileHeader} from './mobileHeader'
import './shareAdminSession'
import { setupMobileDirectorySwipe } from "./directorySwipe"
import { activateDirectoryGroup, activeDirectoryGroup, type DirectoryGroup } from "./directoryGroups"
import { setupDirectoryFrame } from "./directoryFrame"
import { addDirectoryCleanup, finishDirectoryUpdate } from "./directoryPersistence"
import { revealDirectoryEntry } from "./directoryScroll"
import { FileTrieNode } from "../../util/fileTrie"
import { FullSlug, resolveRelative, simplifySlug } from "../../util/path"
import { ContentDetails } from "../../util/contentTypes"
import { encryptedIcon } from "../../util/encryptedIcon"
import { setupDriveDirectories } from "./driveNavigation"
import { setupVideoDirectories } from "./videoNavigation"
import { setupRepoDirectories } from "./repoNavigation"

type MaybeHTMLElement = HTMLElement | undefined

interface ParsedOptions {
  folderClickBehavior: "collapse" | "link"
  folderDefaultState: "collapsed" | "open"
  useSavedState: boolean
  sortFn: (a: FileTrieNode, b: FileTrieNode) => number
  filterFn: (node: FileTrieNode) => boolean
  mapFn: (node: FileTrieNode) => void
  order: "sort" | "filter" | "map"[]
}

type FolderState = {
  path: string
  collapsed: boolean
}

const initialized = new WeakSet<HTMLElement>(), initializing = new WeakSet<HTMLElement>()
const scrolls = new WeakMap<HTMLElement, AbortController>()
const folderMotionFrames = new WeakMap<HTMLElement, number>()
const explorerOptions = new WeakMap<HTMLElement, ParsedOptions>()
let indexVersion = "", indexPromise: Promise<Record<FullSlug, ContentDetails>> | undefined
const LIVE_INDEX_INTERVAL = 15_000
let liveCheckedAt = Date.now(), liveRequest: Promise<void> | undefined
const directoryHref = (slug: FullSlug) => new URL(resolveRelative("index" as FullSlug, slug), `${location.origin}/`).href
let currentExplorerState: Array<FolderState> = []

function updateCurrentEntry(explorer: HTMLElement, slug: FullSlug, followRoute = true) {
  if (followRoute && slug !== "index" && !slug.startsWith("Share/")) activateDirectoryGroup({ domain: "explore", root: slug.split("/")[0], path: simplifySlug(slug).replace(/\/$/, "") })
  if (followRoute && slug === "index") {
    setAllFolders(explorer, true)
    explorer.classList.remove("collapsed")
    explorer.setAttribute("aria-expanded", "true")
    explorer.querySelector(".desktop-explorer")?.setAttribute("aria-expanded", "true")
    const section = explorer.querySelector<HTMLDetailsElement>(".mobile-directory-explore")
    if (section) section.open = true
    for (const scroller of [explorer.closest<HTMLElement>(".directory-scroll"), explorer.querySelector<HTMLElement>(".explorer-content")]) {
      if (scroller) scroller.scrollTo({ top: 0, left: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
    }
  }
  const normal = simplifySlug(slug).replace(/\/$/, "")
  for (const link of explorer.querySelectorAll<HTMLAnchorElement>(".explorer-ul a[data-for]")) {
    const target = link.dataset.for as FullSlug
    link.href = directoryHref(target)
    const match = simplifySlug(target).replace(/\/$/, "") === normal
    link.classList.toggle("active", match && !link.classList.contains("folder-title"))
    if (match) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current")
  }
  for (const folder of explorer.querySelectorAll<HTMLElement>(".folder-container")) {
    const path = folder.dataset.folderpath as FullSlug
    const simple = simplifySlug(path).replace(/\/$/, "")
    folder.classList.toggle("active", simple === normal)
    const saved = currentExplorerState.find(item => item.path === path)
    if (followRoute && folder.nextElementSibling) setFolderState(folder.nextElementSibling as HTMLElement, !(folder.nextElementSibling.classList.contains("open") || saved?.collapsed === false || normal === simple || normal.startsWith(`${simple}/`)))
  }
  if (followRoute) {
    scrolls.get(explorer)?.abort()
    const controller = new AbortController(); scrolls.set(explorer, controller)
    const tree = explorer.querySelector<HTMLElement>(".explorer-ul")
    if (tree && !slug.startsWith("Share/")) void revealDirectoryEntry(tree, controller.signal)
    document.dispatchEvent(new CustomEvent("directory-ready"))
  }
  finishDirectoryUpdate(explorer)
}

function explorerTrie(data: Record<FullSlug, ContentDetails>, opts: ParsedOptions) {
  // Use index keys as canonical identities for both cached and live snapshots.
  const entries = Object.entries(data).filter(([slug]) => !slug.startsWith("Share/")).map(([slug, item]) => [slug, { ...item, slug }] as [FullSlug, ContentDetails])
  const trie = FileTrieNode.fromEntries(entries)
  for (const operation of opts.order) {
    if (operation === "filter" && opts.filterFn) trie.filter(opts.filterFn)
    if (operation === "map" && opts.mapFn) trie.map(opts.mapFn)
    if (operation === "sort" && opts.sortFn) trie.sort(opts.sortFn)
  }
  return trie
}

function reconcileExplorer(list: HTMLElement, nodes: FileTrieNode[], slug: FullSlug, opts: ParsedOptions) {
  const existing = new Map<string, HTMLElement>()
  const simple = (path: string) => simplifySlug(path as FullSlug).replace(/\/$/, "")
  for (const item of list.children) {
    const folder = item.querySelector<HTMLElement>(":scope > .folder-container")
    const file = item.querySelector<HTMLElement>(":scope > a[data-for]")
    if (folder) existing.set(`folder:${simple(folder.dataset.folderpath!)}`, item as HTMLElement)
    else if (file) existing.set(`file:${file.dataset.for}`, item as HTMLElement)
  }
  const keep = new Set<HTMLElement>()
  nodes.forEach((node, index) => {
    const key = node.isFolder ? `folder:${simple(node.slug)}` : `file:${node.slug}`
    const item = existing.get(key) || (node.isFolder ? createFolderNode(slug, node, opts) : createFileNode(slug, node))
    keep.add(item)
    const folder = item.querySelector<HTMLElement>(":scope > .folder-container")
    const label = folder?.querySelector<HTMLElement>(".folder-title") || item.querySelector<HTMLAnchorElement>(":scope > a")!
    if (label.textContent !== node.displayName || Boolean(label.querySelector(".encrypted-mark")) !== Boolean(node.data?.encrypted)) {
      label.textContent = node.displayName
      if (node.data?.encrypted && label instanceof HTMLAnchorElement) addEncryptedMark(label)
    }
    if (label instanceof HTMLAnchorElement) {
      const href = directoryHref(node.slug)
      if (label.href !== href) label.href = href
      if (label.dataset.for !== node.slug) label.dataset.for = node.slug
    }
    if (folder) {
      if (folder.dataset.folderpath !== node.slug) folder.dataset.folderpath = node.slug
      if (existing.has(key)) reconcileExplorer(item.querySelector<HTMLElement>(":scope > .folder-outer > ul")!, node.children, slug, opts)
    }
    if (list.children[index] !== item) list.insertBefore(item, list.children[index] || null)
  })
  for (const item of existing.values()) if (!keep.has(item)) item.remove()
  positionDriveRoot(list, nodes)
}

function positionDriveRoot(list: Element, nodes: FileTrieNode[]) {
  const integrations = [...list.querySelectorAll<HTMLElement>(":scope > .directory-drive, :scope > .directory-repo, :scope > .directory-video")]
  if (!integrations.length) return
  // Keep Drive after the last note folder, before any root-level article leaves.
  const lastFolder = nodes.findLastIndex(node => node.isFolder)
  const entries = [...list.children].filter(item => !integrations.includes(item as HTMLElement) && !item.classList.contains("overflow-end"))
  const before = entries[lastFolder + 1] || list.querySelector(":scope > .overflow-end")
  for (const integration of integrations) list.insertBefore(integration, before)
}

async function refreshExplorerIndex(force = false) {
  if (document.visibilityState === "hidden" || !force && Date.now() - liveCheckedAt < LIVE_INDEX_INTERVAL) return
  if (liveRequest) return liveRequest
  if (!indexPromise) {
    liveCheckedAt=Date.now()
    await setupExplorer((document.body.dataset.slug||"index") as FullSlug)
    return
  }
  liveCheckedAt = Date.now()
  liveRequest = (async () => {
    try {
      const data = await readArticleIndex({refresh:force})
      const previous = await indexPromise!.catch(()=>undefined)
      const signature = (value: Record<FullSlug, ContentDetails>|undefined) => JSON.stringify(Object.entries(value||{}).map(([slug,item])=>[slug,item.title,Boolean(item.encrypted),item.filePath]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
      indexPromise = Promise.resolve(data)
      if (signature(data) === signature(previous)) return
      const slug = (document.body.dataset.slug || "index") as FullSlug
      for (const explorer of document.querySelectorAll<HTMLElement>(".explorer.is-loaded")) {
        const opts = explorerOptions.get(explorer), list = explorer.querySelector<HTMLElement>(".explorer-ul")
        if (!opts || !list) continue
        reconcileExplorer(list, explorerTrie(data, opts).children, slug, opts)
        currentExplorerState = [...explorer.querySelectorAll<HTMLElement>(".folder-container")].map(folder => ({ path: folder.dataset.folderpath!, collapsed: !folder.nextElementSibling?.classList.contains("open") }))
        persistFolderState(explorer)
        updateCurrentEntry(explorer, slug, false)
      }
    } catch (error) { console.debug("Directory index refresh skipped", error) }
  })().finally(() => { liveRequest = undefined })
  return liveRequest
}

function directoryIndex(explorer: HTMLElement) {
  const version = explorer.closest<HTMLElement>(".directory-scroll")!.dataset.directoryVersion!
  if (!indexPromise || version!==indexVersion) {
    const pending=readArticleIndex()
    indexPromise=pending
    void pending.catch(()=>{if(indexPromise===pending)indexPromise=undefined})
  }
  indexVersion = version
  return indexPromise
}
function toggleExplorer(this: HTMLElement) {
  const nearestExplorer = this.closest(".explorer") as HTMLElement
  if (!nearestExplorer) return
  const explorerCollapsed = nearestExplorer.classList.toggle("collapsed")
  nearestExplorer.setAttribute("aria-expanded", String(!explorerCollapsed))
  this.setAttribute("aria-expanded", String(!explorerCollapsed))

  if (!explorerCollapsed) {
    const scope = nearestExplorer.querySelector<HTMLElement>(document.body.dataset.slug?.startsWith("Share/") && this.dataset.mobile === "true" ? ".directory-drive" : ".explorer-ul")
    if (scope) void revealDirectoryEntry(scope)
    if (window.matchMedia("(max-width: 800px)").matches) document.documentElement.classList.add("mobile-no-scroll")
  } else {
    document.documentElement.classList.remove("mobile-no-scroll")
  }
}

function toggleFolder(evt: MouseEvent) {
  evt.stopPropagation()
  const target = evt.target as MaybeHTMLElement
  if (!target) return

  // corresponding <ul> element relative to clicked button/folder
  const folderContainer = target.closest(".folder-container") as MaybeHTMLElement
  if (!folderContainer) return
  const childFolderContainer = folderContainer.nextElementSibling as MaybeHTMLElement
  if (!childFolderContainer) return

  childFolderContainer.classList.toggle("open")

  // Collapse folder container
  const isCollapsed = !childFolderContainer.classList.contains("open")
  setFolderState(childFolderContainer, isCollapsed, true)

  const currentFolderState = currentExplorerState.find(
    (item) => item.path === folderContainer.dataset.folderpath,
  )
  if (currentFolderState) {
    currentFolderState.collapsed = isCollapsed
  } else {
    currentExplorerState.push({
      path: folderContainer.dataset.folderpath as FullSlug,
      collapsed: isCollapsed,
    })
  }

  const explorer = folderContainer.closest(".explorer") as MaybeHTMLElement
  if (!isCollapsed) activateDirectoryGroup({ domain: "explore", root: folderContainer.dataset.folderpath!.split("/")[0], path: simplifySlug(folderContainer.dataset.folderpath as FullSlug).replace(/\/$/, "") })
  persistFolderState(explorer)
}

function persistFolderState(explorer: MaybeHTMLElement) {
  if (explorer?.dataset.savestate !== "true") return
  localStorage.setItem("fileTree", JSON.stringify(currentExplorerState))
}

function setAllFolders(explorer: HTMLElement, collapsed: boolean) {
  const folderOuters = explorer.querySelectorAll(".folder-outer") as NodeListOf<HTMLElement>

  for (const folderOuter of folderOuters) {
    setFolderState(folderOuter, collapsed)

    const folderPath = folderOuter.previousElementSibling?.getAttribute("data-folderpath")
    if (!folderPath) continue

    const folderState = currentExplorerState.find((item) => item.path === folderPath)
    if (folderState) {
      folderState.collapsed = collapsed
    }
  }

  persistFolderState(explorer)
}

function addEncryptedMark(link: HTMLAnchorElement) {
  link.dataset.noPopover = "true"
  const mark = document.createElement("span")
  mark.className = "encrypted-mark"
  mark.setAttribute("role", "img")
  mark.setAttribute("aria-label", "加密文章")
  mark.innerHTML = encryptedIcon
  link.prepend(mark)
}

function createFileNode(currentSlug: FullSlug, node: FileTrieNode): HTMLLIElement {
  const template = document.getElementById("template-file") as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as DocumentFragment
  const li = clone.querySelector("li") as HTMLLIElement
  const a = li.querySelector("a") as HTMLAnchorElement
  a.href = directoryHref(node.slug)
  a.dataset.for = node.slug
  a.textContent = node.displayName
  if (node.data?.encrypted) addEncryptedMark(a)

  if (currentSlug === node.slug) {
    a.classList.add("active")
  }

  return li
}

function createFolderNode(
  currentSlug: FullSlug,
  node: FileTrieNode,
  opts: ParsedOptions,
): HTMLLIElement {
  const template = document.getElementById("template-folder") as HTMLTemplateElement
  const clone = template.content.cloneNode(true) as DocumentFragment
  const li = clone.querySelector("li") as HTMLLIElement
  const folderContainer = li.querySelector(".folder-container") as HTMLElement
  const titleContainer = folderContainer.querySelector("div") as HTMLElement
  const folderOuter = li.querySelector(".folder-outer") as HTMLElement
  const ul = folderOuter.querySelector("ul") as HTMLUListElement

  const folderPath = node.slug
  folderContainer.dataset.folderpath = folderPath
  const isCurrentFolder = simplifySlug(currentSlug).replace(/\/$/, "") === simplifySlug(folderPath).replace(/\/$/, "")

  if (isCurrentFolder) {
    folderContainer.classList.add("active")
  }

  if (opts.folderClickBehavior === "link") {
    // Replace button with link for link behavior
    const button = titleContainer.querySelector(".folder-button") as HTMLElement
    const a = document.createElement("a")
    a.href = directoryHref(folderPath)
    a.dataset.for = folderPath
    a.className = "folder-title"
    if (isCurrentFolder) a.setAttribute("aria-current", "page")
    a.textContent = node.displayName
    if (node.data?.encrypted) addEncryptedMark(a)
    button.replaceWith(a)
  } else {
    const span = titleContainer.querySelector(".folder-title") as HTMLElement
    span.textContent = node.displayName
  }

  // if the saved state is collapsed or the default state is collapsed
  const isCollapsed =
    currentExplorerState.find((item) => item.path === folderPath)?.collapsed ??
    opts.folderDefaultState === "collapsed"

  // if this folder is a prefix of the current path we
  // want to open it anyways
  const simpleFolderPath = simplifySlug(folderPath)
  const folderIsPrefixOfCurrentSlug =
    simpleFolderPath === currentSlug.slice(0, simpleFolderPath.length)

  if (!isCollapsed || folderIsPrefixOfCurrentSlug) {
    folderOuter.classList.add("open")
  }

  for (const child of node.children) {
    const childNode = child.isFolder
      ? createFolderNode(currentSlug, child, opts)
      : createFileNode(currentSlug, child)
    ul.appendChild(childNode)
  }

  return li
}

const initializedRealms = new WeakSet<HTMLDetailsElement>()
function setupRealmDirectory() {
  const sections = [...document.querySelectorAll<HTMLDetailsElement>("[data-realm-directory]")]
  const currentPath = location.pathname.replace(/\/(?:index(?:\.html)?)?$/, "")
  for (const section of sections) {
    let active = false
    for (const link of section.querySelectorAll<HTMLAnchorElement>("a")) {
      const targetPath = new URL(link.href).pathname.replace(/\/$/, "")
      const selected = targetPath === currentPath || targetPath === "/tags" && currentPath.startsWith("/tags/")
      link.classList.toggle("active", selected)
      if (selected) { link.setAttribute("aria-current", "page"); active = true }
      else link.removeAttribute("aria-current")
    }
    if (!initializedRealms.has(section)) {
      initializedRealms.add(section)
      try { section.open = localStorage.getItem("quartz-realm-collapsed") !== "true" } catch { /* Keep the default expanded state. */ }
      const summary = section.querySelector<HTMLElement>(":scope > summary")!, list = section.querySelector<HTMLElement>(":scope > ul")!
      let animation: Animation | undefined, expanded = section.open
      const toggle = (event: MouseEvent) => {
        event.preventDefault()
        expanded = animation ? !expanded : !section.open
        const from = section.open ? list.getBoundingClientRect().height : 0
        const margin = section.open ? getComputedStyle(list).marginTop : "0px"
        animation?.cancel()
        section.open = true
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) { section.open = expanded; animation = undefined; return }
        const to = expanded ? list.scrollHeight : 0, targetMargin = getComputedStyle(list).marginTop
        list.style.overflow = "hidden"
        const motion = animation = list.animate([
          { height: `${from}px`, marginTop: margin },
          { height: `${to}px`, marginTop: expanded ? targetMargin : "0px" },
        ], { duration: 300, easing: "ease-in-out", fill: "both" })
        void motion.finished.then(() => {
          if (animation !== motion) return
          section.open = expanded; animation = undefined; motion.cancel(); list.style.removeProperty("overflow")
        }).catch(() => {})
      }
      summary.addEventListener("click", toggle)
      const onToggle = () => {
        try { localStorage.setItem("quartz-realm-collapsed", String(!section.open)) } catch { /* Storage is optional. */ }
        for (const sibling of sections) if (sibling.open !== section.open) sibling.open = section.open
      }
      section.addEventListener("toggle", onToggle)
      addDirectoryCleanup(section, () => { animation?.cancel(); summary.removeEventListener("click", toggle); section.removeEventListener("toggle", onToggle); initializedRealms.delete(section) })
      requestAnimationFrame(() => { if (section.isConnected) section.dataset.motionReady = "" })
    }
    if (active) section.open = true
  }
}

async function setupExplorer(currentSlug: FullSlug) {
  setupRealmDirectory()
  activateDirectoryGroup(currentSlug === "index" ? undefined : currentSlug.startsWith("Share/")
    ? { domain: "drive", root: "Share" }
    : { domain: "explore", root: currentSlug.split("/")[0], path: simplifySlug(currentSlug).replace(/\/$/, "") })
  setupRepoDirectories(currentSlug === "index")
  setupVideoDirectories(currentSlug === "index")
  setupDriveDirectories(currentSlug === "index")
  const allExplorers = document.querySelectorAll("div.explorer") as NodeListOf<HTMLElement>

  for (const explorer of allExplorers) {
    if (initialized.has(explorer)) { updateCurrentEntry(explorer, currentSlug); continue }
    if (initializing.has(explorer)) continue
    initializing.add(explorer)
    const cleanup = (fn: () => void) => addDirectoryCleanup(explorer, fn)
    const lifecycle = new AbortController()
    setupMobileDirectorySwipe(explorer,lifecycle.signal)
    setupDirectoryFrame(explorer.closest<HTMLElement>(".directory-scroll")!, lifecycle.signal)
    cleanup(() => { lifecycle.abort(); scrolls.get(explorer)?.abort(); initialized.delete(explorer); initializing.delete(explorer) })
    explorer.removeAttribute("data-motion-ready")
    const directorySection = explorer.querySelector<HTMLDetailsElement>(".mobile-directory-explore")
    const desktopDirectory = window.matchMedia("(min-width: 801px)")
    if(directorySection){
      const disclose=createDirectoryDetailsMotion(lifecycle.signal,':scope > .directory-root-list')
      const summary=directorySection.querySelector<HTMLElement>(':scope > summary')!
      directorySection.dataset.disclosureMotion='true'
      summary.setAttribute('aria-expanded',String(directorySection.open))
      summary.addEventListener('click',event=>{
        if(desktopDirectory.matches)return
        event.preventDefault();disclose(directorySection,undefined,true)
      },{signal:lifecycle.signal})
    }
    const ensureDesktopDirectory = (event?: MediaQueryListEvent) => {
      if (desktopDirectory.matches) {
        if (event) {
          explorer.classList.remove("collapsed")
          explorer.querySelector(".desktop-explorer")?.setAttribute("aria-expanded", "true")
          document.documentElement.classList.remove("mobile-no-scroll")
        }
        if (directorySection) directorySection.open = true
      }
    }
    ensureDesktopDirectory()
    desktopDirectory.addEventListener("change", ensureDesktopDirectory)
    cleanup(() => desktopDirectory.removeEventListener("change", ensureDesktopDirectory))
    explorer.classList.remove("is-loaded")
    const explorerContent = explorer.querySelector(".explorer-content") as MaybeHTMLElement
    explorerContent?.setAttribute("aria-busy", "true")

    const dataFns = JSON.parse(explorer.dataset.dataFns || "{}")
    const opts: ParsedOptions = {
      folderClickBehavior: (explorer.dataset.behavior || "collapse") as "collapse" | "link",
      folderDefaultState: (explorer.dataset.collapsed || "collapsed") as "collapsed" | "open",
      useSavedState: explorer.dataset.savestate === "true",
      order: dataFns.order || ["filter", "map", "sort"],
      sortFn: new Function("return " + (dataFns.sortFn || "undefined"))(),
      filterFn: new Function("return " + (dataFns.filterFn || "undefined"))(),
      mapFn: new Function("return " + (dataFns.mapFn || "undefined"))(),
    }
    explorerOptions.set(explorer, opts)

    // Get folder state from local storage
    const storageTree = localStorage.getItem("fileTree")
    const serializedExplorerState = storageTree && opts.useSavedState ? JSON.parse(storageTree) : []
    const oldIndex = new Map<string, boolean>(
      serializedExplorerState.map((entry: FolderState) => [entry.path, entry.collapsed]),
    )

    const data = await directoryIndex(explorer)
    if (lifecycle.signal.aborted || !explorer.isConnected) return
    const trie = explorerTrie(data, opts)

    // Get folder paths for state management
    const folderPaths = trie.getFolderPaths()
    currentExplorerState = folderPaths.map((path) => {
      const previousState = oldIndex.get(path)
      return {
        path,
        collapsed:
          previousState === undefined ? opts.folderDefaultState === "collapsed" : previousState,
      }
    })

    const explorerUl = explorer.querySelector(".explorer-ul")
    if (!explorerUl) continue

    // Create and insert new content
    const fragment = document.createDocumentFragment()
    for (const child of trie.children) {
      const node = child.isFolder
        ? createFolderNode(currentSlug, child, opts)
        : createFileNode(currentSlug, child)

      fragment.appendChild(node)
    }
    explorerUl.insertBefore(fragment, explorerUl.firstChild)
    positionDriveRoot(explorerUl, trie.children)
    const closeOtherRoots = (group: DirectoryGroup | undefined) => {
      if (!group) return
      for (const folder of explorer.querySelectorAll<HTMLElement>(".folder-container")) {
        const path = folder.dataset.folderpath!
        const simple = simplifySlug(path as FullSlug).replace(/\/$/, "")
        if (group.domain === "explore" && path.split("/")[0] === group.root &&
          (!group.path || simple === group.path || group.path.startsWith(`${simple}/`) || simple.startsWith(`${group.path}/`))) continue
        setFolderState(folder.nextElementSibling as HTMLElement, true)
        const state = currentExplorerState.find(item => item.path === path)
        if (state) state.collapsed = true
      }
      persistFolderState(explorer)
    }
    const groupChanged = (event: Event) => closeOtherRoots((event as CustomEvent<DirectoryGroup | undefined>).detail)
    document.addEventListener("directory-group-change", groupChanged)
    cleanup(() => document.removeEventListener("directory-group-change", groupChanged))
    closeOtherRoots(activeDirectoryGroup())
    for (const drive of explorer.querySelectorAll<HTMLElement>(".directory-drive")) { drive.classList.add("is-loaded"); drive.dataset.motionReady = "" }
    explorer.classList.add("is-loaded")
    explorerContent?.setAttribute("aria-busy", "false")
    let motionFrame = requestAnimationFrame(() => {
      motionFrame = requestAnimationFrame(() => { explorer.dataset.motionReady = "" })
    })
    cleanup(() => { cancelAnimationFrame(motionFrame); explorer.removeAttribute("data-motion-ready") })

    const restoreScroll = () => {
      if (!explorerContent?.isConnected) return
      const scroller = desktopDirectory.matches ? explorer.closest<HTMLElement>(".directory-scroll")! : explorerContent
      const key = desktopDirectory.matches ? "directoryScroll" : "explorerScroll"
      scroller.scrollLeft = Number(sessionStorage.getItem(`${key}Left`)) || 0
      scroller.scrollTop = Number(sessionStorage.getItem(`${key}Top`)) || 0
    }
    restoreScroll()

    // Set up event handlers
    const explorerButtons = explorer.getElementsByClassName(
      "explorer-toggle",
    ) as HTMLCollectionOf<HTMLElement>
    for (const button of explorerButtons) {
      button.addEventListener("click", toggleExplorer)
      // @ts-ignore
      cleanup(() => button.removeEventListener("click", toggleExplorer))
    }

    explorer.addEventListener("click", event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>("a.folder-title")
      const parent = link?.closest<HTMLElement>(".folder-container")
      if (!parent) return
      for (const folder of parent.nextElementSibling?.querySelectorAll<HTMLElement>(".folder-container") || []) {
        setFolderState(folder.nextElementSibling as HTMLElement, true)
        const state = currentExplorerState.find(item => item.path === folder.dataset.folderpath)
        if (state) state.collapsed = true
      }
      persistFolderState(explorer)
    }, { signal: lifecycle.signal })

    // Delegation also covers folders added by a live index update.
    explorer.addEventListener("click", event => {
      const target = event.target as Element
      if (target.closest(".folder-icon") || opts.folderClickBehavior === "collapse" && target.closest("button.folder-button")) toggleFolder(event)
    }, { signal: lifecycle.signal })

    initializing.delete(explorer); initialized.add(explorer)
    updateCurrentEntry(explorer, document.body.dataset.slug as FullSlug || currentSlug)
  }
}

document.addEventListener("prenav", async () => {
  // save explorer scrollTop position
  const desktop = window.matchMedia("(min-width: 801px)").matches
  const scroller = document.querySelector(desktop ? ".directory-scroll" : ".explorer-content")
  if (!scroller) return
  const key = desktop ? "directoryScroll" : "explorerScroll"
  sessionStorage.setItem(`${key}Top`, scroller.scrollTop.toString())
  sessionStorage.setItem(`${key}Left`, scroller.scrollLeft.toString())
})

// @ts-ignore
document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const currentSlug = e.detail.url
  setupMobileHeader()
  await setupExplorer(currentSlug)
  void refreshExplorerIndex()

  document.documentElement.classList.remove("mobile-no-scroll")
  // if mobile hamburger is visible, collapse by default
  for (const explorer of document.getElementsByClassName("explorer")) {
    const mobileExplorer = explorer.querySelector(".mobile-explorer")
    if (!mobileExplorer || !explorer.classList.contains("is-loaded")) continue

    if (mobileExplorer.checkVisibility()) {
      explorer.classList.add("collapsed")
      explorer.setAttribute("aria-expanded", "false")

      // Allow <html> to be scrollable when mobile explorer is collapsed
      document.documentElement.classList.remove("mobile-no-scroll")
    }

    mobileExplorer.classList.remove("hide-until-loaded")
  }
})

window.setInterval(() => { void refreshExplorerIndex() }, LIVE_INDEX_INTERVAL)
window.addEventListener("focus", () => { void refreshExplorerIndex(true) })
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refreshExplorerIndex(true) })

window.addEventListener("resize", () => {
  const explorer = document.querySelector(".explorer")
  document.documentElement.classList.toggle("mobile-no-scroll", window.matchMedia("(max-width: 800px)").matches && Boolean(explorer && !explorer.classList.contains("collapsed")))
})

function setFolderState(folderElement: HTMLElement, collapsed: boolean, animate = false) {
  if (folderElement.classList.contains("open") === !collapsed) return
  cancelAnimationFrame(folderMotionFrames.get(folderElement) || 0)
  if (animate) delete folderElement.dataset.routeUpdating
  else folderElement.dataset.routeUpdating = ""
  folderElement.classList.toggle("open", !collapsed)
  if (!animate) folderMotionFrames.set(folderElement, requestAnimationFrame(() => {
    folderMotionFrames.set(folderElement, requestAnimationFrame(() => {
      delete folderElement.dataset.routeUpdating; folderMotionFrames.delete(folderElement)
    }))
  }))
}
