import {repoHoverContent} from './repoHover'
import {driveHoverContent} from './driveHover'
import { escapeHTML } from "../../util/escape"
import { encryptedIcon } from "../../util/encryptedIcon"
import { ContentDetails } from "../../util/contentTypes"
import { registerEscapeHandler, removeAllChildren } from "./util"
import { FullSlug, normalizeRelativeURLs, resolveRelative } from "../../util/path"

type SearchContentIndex = Record<FullSlug, ContentDetails>

interface Item {
  id: number
  slug: FullSlug
  title: string
  content: string
  tags: string[]
  encrypted?: boolean
  [key: string]: any
}

// Can be expanded with things like "term" in the future
type SearchType = "basic" | "tags"
let searchType: SearchType = "basic"
let currentSearchTerm: string = ""

const p = new DOMParser()
const fetchContentCache: Map<FullSlug, Element[]> = new Map()
const contextWindowWords = 30
const numTagResults = 5

const tokenizeTerm = (term: string) => {
  const tokens = term.split(/\s+/).filter((t) => t.trim() !== "")
  const tokenLen = tokens.length
  if (tokenLen > 1) {
    for (let i = 1; i < tokenLen; i++) {
      tokens.push(tokens.slice(0, i + 1).join(" "))
    }
  }

  return tokens.sort((a, b) => b.length - a.length) // always highlight longest terms first
}

function highlight(searchTerm: string, text: string, trim?: boolean) {
  const tokenizedTerms = tokenizeTerm(searchTerm)
  let tokenizedText = text.split(/\s+/).filter((t) => t !== "")

  let startIndex = 0
  let endIndex = tokenizedText.length - 1
  if (trim) {
    const includesCheck = (tok: string) =>
      tokenizedTerms.some((term) => tok.toLowerCase().startsWith(term.toLowerCase()))
    const occurrencesIndices = tokenizedText.map(includesCheck)

    let bestSum = 0
    let bestIndex = 0
    for (let i = 0; i < Math.max(tokenizedText.length - contextWindowWords, 0); i++) {
      const window = occurrencesIndices.slice(i, i + contextWindowWords)
      const windowSum = window.reduce((total, cur) => total + (cur ? 1 : 0), 0)
      if (windowSum >= bestSum) {
        bestSum = windowSum
        bestIndex = i
      }
    }

    startIndex = Math.max(bestIndex - contextWindowWords, 0)
    endIndex = Math.min(startIndex + 2 * contextWindowWords, tokenizedText.length - 1)
    tokenizedText = tokenizedText.slice(startIndex, endIndex)
  }

  const slice = tokenizedText
    .map((tok) => {
      // see if this tok is prefixed by any search terms
      for (const searchTok of tokenizedTerms) {
        if (tok.toLowerCase().includes(searchTok.toLowerCase())) {
          const regex = new RegExp(searchTok.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
          return tok.replace(regex, `<span class="highlight">$&</span>`)
        }
      }
      return tok
    })
    .join(" ")

  return `${startIndex === 0 ? "" : "..."}${slice}${
    endIndex === tokenizedText.length - 1 ? "" : "..."
  }`
}

function highlightHTML(searchTerm: string, el: HTMLElement) {
  const p = new DOMParser()
  const tokenizedTerms = tokenizeTerm(searchTerm)
  const html = p.parseFromString(el.innerHTML, "text/html")

  const createHighlightSpan = (text: string) => {
    const span = document.createElement("span")
    span.className = "highlight"
    span.textContent = text
    return span
  }

  const highlightTextNodes = (node: Node, term: string) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeText = node.nodeValue ?? ""
      const regex = new RegExp(term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
      const matches = nodeText.match(regex)
      if (!matches || matches.length === 0) return
      const spanContainer = document.createElement("span")
      let lastIndex = 0
      for (const match of matches) {
        const matchIndex = nodeText.indexOf(match, lastIndex)
        spanContainer.appendChild(document.createTextNode(nodeText.slice(lastIndex, matchIndex)))
        spanContainer.appendChild(createHighlightSpan(match))
        lastIndex = matchIndex + match.length
      }
      spanContainer.appendChild(document.createTextNode(nodeText.slice(lastIndex)))
      node.parentNode?.replaceChild(spanContainer, node)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as HTMLElement).classList.contains("highlight")) return
      Array.from(node.childNodes).forEach((child) => highlightTextNodes(child, term))
    }
  }

  for (const term of tokenizedTerms) {
    highlightTextNodes(html.body, term)
  }

  return html.body
}

async function setupSearch(searchElement: Element, currentSlug: FullSlug, data: SearchContentIndex) {
  const container = searchElement.querySelector(".search-container") as HTMLElement
  if (!container) return

  const sidebar = container.closest(".sidebar") as HTMLElement | null

  const searchButton = searchElement.querySelector(".search-button") as HTMLButtonElement
  if (!searchButton) return

  const searchBar = searchElement.querySelector(".search-bar") as HTMLInputElement
  if (!searchBar) return

  const searchLayout = searchElement.querySelector(".search-layout") as HTMLElement
  if (!searchLayout) return

  const viewport = window.visualViewport
  const fitViewport = () => {
    if (viewport && matchMedia('(max-width:800px)').matches && container.classList.contains('active')) {
      container.style.setProperty('--search-viewport-height', `${Math.floor(viewport.height)}px`)
      container.style.setProperty('--search-viewport-top', `${viewport.offsetTop}px`)
    } else {
      container.style.removeProperty('--search-viewport-height')
      container.style.removeProperty('--search-viewport-top')
    }
  }
  viewport?.addEventListener('resize', fitViewport)
  viewport?.addEventListener('scroll', fitViewport)
  window.addEventListener('resize', fitViewport)
  window.addCleanup(() => {
    viewport?.removeEventListener('resize', fitViewport)
    viewport?.removeEventListener('scroll', fitViewport)
    window.removeEventListener('resize', fitViewport)
  })

  let searchRequest = 0
  let searchTimer:ReturnType<typeof setTimeout>|undefined, searchAbort:AbortController|undefined
  window.addCleanup(()=>{clearTimeout(searchTimer);searchAbort?.abort()})
  const appendLayout = (el: HTMLElement) => {
    searchLayout.appendChild(el)
  }

  const enablePreview = searchLayout.dataset.preview === "true"
  let preview: HTMLDivElement | undefined = undefined
  let previewInner: HTMLDivElement | undefined = undefined
  const results = document.createElement("div")
  results.className = "results-container"
  appendLayout(results)

  if (enablePreview) {
    preview = document.createElement("div")
    preview.className = "preview-container"
    appendLayout(preview)
  }

  function hideSearch() {
    searchRequest++;clearTimeout(searchTimer);searchAbort?.abort()
    container.classList.remove("active")
    fitViewport()
    searchBar.value = "" // clear the input when we dismiss the search
    if (sidebar) sidebar.style.zIndex = ""
    removeAllChildren(results)
    if (preview) {
      removeAllChildren(preview)
    }
    searchLayout.classList.remove("display-results")
    searchType = "basic" // reset search type after closing
    searchButton.focus()
  }

  function showSearch(searchTypeNew: SearchType) {
    searchType = searchTypeNew
    if (sidebar) sidebar.style.zIndex = "1"
    container.classList.add("active")
    fitViewport()
    searchBar.focus()
  }

  let currentHover: HTMLInputElement | null = null
  async function shortcutHandler(e: HTMLElementEventMap["keydown"]) {
    if (e.key === "k" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      const searchBarOpen = container.classList.contains("active")
      searchBarOpen ? hideSearch() : showSearch("basic")
      return
    } else if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      // Hotkey to open tag search
      e.preventDefault()
      const searchBarOpen = container.classList.contains("active")
      searchBarOpen ? hideSearch() : showSearch("tags")

      // add "#" prefix for tag search
      searchBar.value = "#"
      return
    }

    if (currentHover) {
      currentHover.classList.remove("focus")
    }

    // If search is active, then we will render the first result and display accordingly
    if (!container.classList.contains("active")) return
    if (e.key === "Enter" && !e.isComposing) {
      // If result has focus, navigate to that one, otherwise pick first result
      if (results.contains(document.activeElement)) {
        const active = document.activeElement as HTMLInputElement
        if (active.classList.contains("no-match")) return
        await displayPreview(active)
        active.click()
      } else {
        const anchor = document.getElementsByClassName("result-card")[0] as HTMLInputElement | null
        if (!anchor || anchor.classList.contains("no-match")) return
        await displayPreview(anchor)
        anchor.click()
      }
    } else if (e.key === "ArrowUp" || (e.shiftKey && e.key === "Tab")) {
      e.preventDefault()
      if (results.contains(document.activeElement)) {
        // If an element in results-container already has focus, focus previous one
        const currentResult = currentHover
          ? currentHover
          : (document.activeElement as HTMLInputElement | null)
        const prevResult = currentResult?.previousElementSibling as HTMLInputElement | null
        currentResult?.classList.remove("focus")
        prevResult?.focus()
        if (prevResult) currentHover = prevResult
        await displayPreview(prevResult)
      }
    } else if (e.key === "ArrowDown" || e.key === "Tab") {
      e.preventDefault()
      // The results should already been focused, so we need to find the next one.
      // The activeElement is the search bar, so we need to find the first result and focus it.
      if (document.activeElement === searchBar || currentHover !== null) {
        const firstResult = currentHover
          ? currentHover
          : (document.getElementsByClassName("result-card")[0] as HTMLInputElement | null)
        const secondResult = firstResult?.nextElementSibling as HTMLInputElement | null
        firstResult?.classList.remove("focus")
        secondResult?.focus()
        if (secondResult) currentHover = secondResult
        await displayPreview(secondResult)
      }
    }
  }

  const formatForDisplay = (term: string, slug: FullSlug, id: number) => {
    return {
      id,
      slug,
      title: searchType === "tags" ? escapeHTML(data[slug].title) : highlight(term, escapeHTML(data[slug].title ?? "")),
      content: highlight(term, escapeHTML(data[slug].content ?? ""), true),
      tags: highlightTags(term.substring(1), data[slug].tags),
      encrypted: Boolean(data[slug].encrypted),
    }
  }

  function highlightTags(term: string, tags: string[]) {
    if (!tags || searchType !== "tags") {
      return []
    }

    return tags
      .map((tag) => {
        if (tag.toLowerCase().includes(term.toLowerCase())) {
          return `<li><p class="match-tag">#${tag}</p></li>`
        } else {
          return `<li><p>#${tag}</p></li>`
        }
      })
      .slice(0, numTagResults)
  }

  function resolveUrl(slug: FullSlug): URL {
    const known=data[slug] as ContentDetails & {href?:string}
    if(known?.href)return new URL(known.href,location.origin)
    return new URL(resolveRelative(currentSlug, slug), currentSlug === "Share/index" ? new URL("/Share/", location.origin) : document.querySelector("[data-tag-page]") ? new URL(`/${currentSlug}`, location.origin) : location.toString())
  }

  const resultToHTML = ({ slug, title, content, tags, encrypted }: Item) => {
    const htmlTags = tags.length > 0 ? `<ul class="tags">${tags.join("")}</ul>` : ``
    const itemTile = document.createElement("a")
    itemTile.classList.add("result-card")
    itemTile.id = slug
    itemTile.href = resolveUrl(slug).toString()
    if (encrypted) itemTile.dataset.noPopover = "true"
    const mark = encrypted ? `<span class="encrypted-mark" role="img" aria-label="加密文章">${encryptedIcon}</span>` : ""
    itemTile.innerHTML = `
      <h3 class="card-title">${mark}${title}</h3>
      ${htmlTags}
      <p class="card-description">${content}</p>
    `
    itemTile.addEventListener("click", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      hideSearch()
    })

    const handler = (event: MouseEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      hideSearch()
    }

    async function onMouseEnter(ev: MouseEvent) {
      if (!ev.target) return
      const target = ev.target as HTMLInputElement
      await displayPreview(target)
    }

    itemTile.addEventListener("mouseenter", onMouseEnter)
    // @ts-ignore
    window.addCleanup(() => itemTile.removeEventListener("mouseenter", onMouseEnter))
    itemTile.addEventListener("click", handler)
    // @ts-ignore
    window.addCleanup(() => itemTile.removeEventListener("click", handler))

    return itemTile
  }

  async function displayResults(finalResults: Item[]) {
    removeAllChildren(results)
    if (finalResults.length === 0) {
      results.innerHTML = `<a class="result-card no-match">
          <h3>没有找到相关内容</h3>
          <p>试试其他关键词。</p>
      </a>`
    } else {
      results.append(...finalResults.map(resultToHTML))
    }

    if (finalResults.length === 0 && preview) {
      // Cancel pending article previews when the results disappear.
      previewRequest++
      dynamicPreview?.abort()
      removeAllChildren(preview)
    } else {
      // focus on first result, then also dispatch preview immediately
      const firstChild = results.firstElementChild as HTMLElement
      firstChild.classList.add("focus")
      currentHover = firstChild as HTMLInputElement
      await displayPreview(firstChild)
    }
  }

  async function fetchContent(slug: FullSlug): Promise<Element[]> {
    if (fetchContentCache.has(slug)) {
      return fetchContentCache.get(slug) as Element[]
    }

    const targetUrl = resolveUrl(slug).toString()
    const contents = await fetch(targetUrl)
      .then((res) => res.text())
      .then((contents) => {
        if (contents === undefined) {
          throw new Error(`Could not fetch ${targetUrl}`)
        }
        const html = p.parseFromString(contents ?? "", "text/html")
        normalizeRelativeURLs(html, targetUrl)
        return [...html.getElementsByClassName("popover-hint")]
      })

    fetchContentCache.set(slug, contents)
    return contents
  }

  let previewRequest = 0
  let dynamicPreview:AbortController|undefined
  window.addCleanup(()=>dynamicPreview?.abort())
  async function displayPreview(el: HTMLElement | null) {
    if (!searchLayout || !enablePreview || !el || !preview) return
    const slug = el.id as FullSlug
    const request = ++previewRequest
    dynamicPreview?.abort()
    if (!data[slug]) { preview.replaceChildren(); return }
    if (data[slug]?.encrypted) {
      removeAllChildren(preview)
      return
    }
    if(/^(Share|Repo)\//.test(slug)){
      const controller=dynamicPreview=new AbortController()
      preview.replaceChildren()
      try{
        const url=new URL('/'+slug.split('/').map(encodeURIComponent).join('/')+'/',location.origin)
        const content=await (slug.startsWith('Repo/')?repoHoverContent(url,data[slug].title,controller.signal):driveHoverContent(url,data[slug].title,controller.signal))
        if(controller.signal.aborted||request!==previewRequest)return
        if(content){const inner=document.createElement('div');inner.className='preview-inner';inner.append(content);preview.replaceChildren(inner)}
      }catch{/* Keep unavailable or locked previews empty. */}
      return
    }
    if(/^Video\//.test(slug)){const summary=document.createElement('p');summary.textContent=data[slug].content||data[slug].title;preview.replaceChildren(summary);return}
    const innerDiv = await fetchContent(slug).then((contents) =>
      contents.flatMap((el) => [...highlightHTML(currentSearchTerm, el as HTMLElement).children]),
    )
    if (request !== previewRequest) return
    previewInner = document.createElement("div")
    previewInner.classList.add("preview-inner")
    previewInner.append(...innerDiv)
    preview.replaceChildren(previewInner)

    // scroll to longest
    const highlights = [...preview.getElementsByClassName("highlight")].sort(
      (a, b) => b.innerHTML.length - a.innerHTML.length,
    )
    highlights[0]?.scrollIntoView({ block: "start" })
  }

  function onType(e: HTMLElementEventMap["input"]) {
    const request=++searchRequest,query=(e.target as HTMLInputElement).value.trim()
    currentSearchTerm=query;searchType=query.startsWith('#')?'tags':'basic'
    searchLayout.classList.toggle('display-results',Boolean(query))
    clearTimeout(searchTimer);searchAbort?.abort();if(!query)return
    searchTimer=setTimeout(async()=>{
      const controller=searchAbort=new AbortController()
      try{
        const response=await fetch('/api/site/content/search?'+new URLSearchParams({q:query}),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),cache:'no-store'})
        if(!response.ok)throw Error('搜索暂不可用')
        const value:{results:(ContentDetails&{href:string})[]}=await response.json()
        if(request!==searchRequest||!container.classList.contains('active'))return
        const tagQuery=query.startsWith('#')?query.slice(1):query
        if(query.startsWith('#')&&tagQuery.includes(' ')){searchType='basic';currentSearchTerm=tagQuery.slice(tagQuery.indexOf(' ')+1)}
        for(const record of value.results)data[record.slug]=record
        await displayResults(value.results.map((record,id)=>formatForDisplay(currentSearchTerm,record.slug,id)))
      }catch(error){if(controller.signal.aborted||request!==searchRequest)return;results.replaceChildren();const message=document.createElement('p');message.className='result-card no-match';message.textContent='搜索暂不可用，请稍后重试。';results.append(message)}
    },150)
  }

  document.addEventListener("keydown", shortcutHandler)
  // @ts-ignore
  window.addCleanup(() => document.removeEventListener("keydown", shortcutHandler))
  searchButton.addEventListener("click", () => showSearch("basic"))
  // @ts-ignore
  window.addCleanup(() => searchButton.removeEventListener("click", () => showSearch("basic")))
  searchBar.addEventListener("input", onType)
  // @ts-ignore
  window.addCleanup(() => searchBar.removeEventListener("input", onType))

  registerEscapeHandler(container, hideSearch)
}

// @ts-ignore
document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const currentSlug = e.detail.url
  const data: SearchContentIndex = {}
  const searchElement = document.getElementsByClassName("search")
  for (const element of searchElement) {
    await setupSearch(element, currentSlug, { ...data })
  }
})
