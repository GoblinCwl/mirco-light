import { hoverDismissal } from './hoverDismissal'
import { isNavigationLink } from "../../util/previewPolicy"
import { attachVideoPreview } from "./videoPreview"
import {repoHoverContent,repoHoverAvailable} from "./repoHover"
import { computePosition, flip, inline, shift } from "@floating-ui/dom"
import { normalizeRelativeURLs } from "../../util/path"
import { fetchCanonical } from "./util"
import { driveHoverAllowed, driveHoverContent } from "./driveHover"
import { hideHoverPanel, showHoverPanel } from "./hoverPanel"

function previewLoading() {
  const loading=document.createElement('div');loading.className='hover-preview-loading';loading.setAttribute('role','status')
  loading.innerHTML='<span class="drive-loading" aria-hidden="true"><i></i></span><span>正在加载预览…</span>'
  return loading
}
const p = new DOMParser()
let activeAnchor: HTMLAnchorElement | null = null
let driveHoverTimer: ReturnType<typeof setTimeout> | undefined
let driveHoverRequest: AbortController | undefined
const dismissal=hoverDismissal(clearActivePopover,()=>Boolean(activeAnchor?.matches(':hover')||document.querySelector('.popover:hover')))
for(const event of ['drive-auth-change','drive-directory-unlocked','drive-files-changed'])document.addEventListener(event,()=>{
  clearActivePopover();document.querySelectorAll('.drive-popover,.repo-popover').forEach(node=>node.remove())
})

async function showDriveHover(link:HTMLAnchorElement,event:{clientX:number;clientY:number},repo=false) {
  clearActivePopover();
  if(repo&&!repoHoverAvailable(new URL(link.href)))return
  activeAnchor=link
  {
    const request=driveHoverRequest=new AbortController()
    const eligibility=repo?Promise.resolve(true):driveHoverAllowed(new URL(link.href),Boolean(link.closest('.home-encounter,.tag-project-dialog')),request.signal)
    const allowMedia=Boolean(link.closest('.home-encounter,.tag-project-dialog'))
    if(!await eligibility||request.signal.aborted||activeAnchor!==link)return
    document.querySelectorAll('.drive-popover,.repo-popover').forEach(node=>node.remove())
    const popover=document.createElement('div'),inner=document.createElement('div')
    popover.className=`popover ${repo?'repo-popover':'drive-popover'} active-popover`;inner.className='popover-inner';popover.append(inner)
    const position=async()=>{
      const {x,y}=await computePosition(link,popover,{strategy:'fixed',middleware:[inline({x:event.clientX,y:event.clientY}),shift({padding:8}),flip()]})
      if(!request.signal.aborted)popover.style.transform=`translate(${x.toFixed()}px,${y.toFixed()}px)`
    }
    inner.append(previewLoading());showHoverPanel(popover,link);void position()
    const cancel=()=>popover.remove();request.signal.addEventListener('abort',cancel,{once:true})
    try{
      const url=new URL(link.href),label=link.textContent?.trim()||link.getAttribute('aria-label')||''
      const content=await (repo?repoHoverContent(url,label,request.signal):driveHoverContent(url,label,request.signal,allowMedia))
      if(request.signal.aborted||activeAnchor!==link)return
      if(!content){popover.remove();return}
      popover.classList.toggle('drive-file-popover',Boolean(content.querySelector('.drive-hover-file')))
      request.signal.removeEventListener('abort',cancel);inner.replaceChildren(content);void position()
      inner.querySelectorAll('img').forEach(img=>img.addEventListener('load',()=>void position(),{once:true,signal:request.signal}))
    }catch{if(!request.signal.aborted)popover.remove()}
  }
}

async function mouseEnterHandler(
  this: HTMLAnchorElement,
  { clientX, clientY }: { clientX: number; clientY: number },
) {
  const link = this
  if (isNavigationLink(link.href, location.href)) return
  // Tags are navigation/filter links, never content preview targets. Check the
  // destination too, covering Markdown links and dynamically rendered tags.
  if (link.classList.contains("tag-link") || link.closest(".tags") ||
    new URL(link.href).origin === location.origin && /^\/tags(?:\/|$)/.test(link.pathname)) return
  // Native title tooltips should never sit on top of a content preview.
  if(link.dataset.noPopover!=="true"||link.dataset.repoHover==='true'||link.dataset.driveHover==='true'){
    for(const element of [link,...link.querySelectorAll<HTMLElement>('[title]')]){
      if(element.hasAttribute('title')){if(!element.hasAttribute('aria-label'))element.setAttribute('aria-label',element.getAttribute('title')!);element.removeAttribute('title')}
    }
  }
  if(link.dataset.repoHover==='true'){
    if(matchMedia('(hover: hover) and (pointer: fine)').matches)void showDriveHover(link,{clientX,clientY},true)
    return
  }
  const isDrive=new URL(link.href).origin===location.origin&&/^\/Share(?:\/|$)/.test(link.pathname)
  if(isDrive&&link.closest('.explorer,.directory-tools,.directory-frame'))return
  if(isDrive&&(link.dataset.noPopover!=="true"||link.dataset.driveHover==="true")) {
    if(matchMedia('(hover: hover) and (pointer: fine)').matches)void showDriveHover(link,{clientX,clientY})
    return
  }
  clearActivePopover()
  activeAnchor=link
  if (link.dataset.noPopover === "true") {
    return
  }

  async function setPosition(popoverElement: HTMLElement) {
    const { x, y } = await computePosition(link, popoverElement, {
      strategy: "fixed",
      middleware: [inline({ x: clientX, y: clientY }), shift(), flip()],
    })
    Object.assign(popoverElement.style, {
      transform: `translate(${x.toFixed()}px, ${y.toFixed()}px)`,
    })
  }

  function scrollToHeading(popoverElement: HTMLElement) {
    if (hash !== "") {
      const inner = popoverElement.querySelector<HTMLElement>(".popover-inner")
      const heading = inner?.querySelector<HTMLElement>(`#${CSS.escape("popover-internal-" + hash.slice(1))}`)
      if (inner && heading) {
        // leave ~12px of buffer when scrolling to a heading
        inner.scroll({ top: heading.offsetTop - 12, behavior: "instant" })
      }
    }
  }

  function showPopover(popoverElement: HTMLElement) {
    document.querySelectorAll('.active-popover').forEach(node=>node.classList.remove('active-popover'))
    popoverElement.classList.add("active-popover")
    showHoverPanel(popoverElement, link)
    void setPosition(popoverElement)
    scrollToHeading(popoverElement)
  }

  const targetUrl = new URL(link.href)
  let hash = targetUrl.hash
  try { hash = decodeURIComponent(hash) } catch { /* Keep a malformed fragment literal. */ }
  targetUrl.hash = ""
  targetUrl.search = ""
  const popoverId = `popover-${link.pathname}`
  const prevPopoverElement = document.getElementById(popoverId)

  // dont refetch if there's already a popover
  if (!!document.getElementById(popoverId)) {
    showPopover(prevPopoverElement as HTMLElement)
    return
  }

  const request=driveHoverRequest=new AbortController()
  const popoverElement = document.createElement("div")
  popoverElement.id = popoverId
  popoverElement.classList.add("popover")
  const popoverInner = document.createElement("div")
  popoverInner.classList.add("popover-inner")
  popoverInner.append(previewLoading())
  popoverElement.appendChild(popoverInner)
  showPopover(popoverElement)
  const cancel=()=>popoverElement.remove()
  request.signal.addEventListener("abort",cancel,{once:true})
  const response = await fetchCanonical(targetUrl,{signal:request.signal}).catch(()=>undefined)
  if (!response?.ok || request.signal.aborted || activeAnchor!==link) {popoverElement.remove();return}
  const contentType=response.headers.get("Content-Type") || "text/html"
  const [contentTypeCategory, typeInfo]=contentType.split(";")[0].split("/")
  popoverInner.dataset.contentType=contentType
  popoverInner.replaceChildren()
  switch (contentTypeCategory) {
    case "image":
      const img = document.createElement("img")
      img.src = targetUrl.toString()
      img.alt = targetUrl.pathname

      popoverInner.appendChild(img)
      break
    case "application":
      switch (typeInfo) {
        case "pdf":
          const pdf = document.createElement("iframe")
          pdf.src = targetUrl.toString()
          popoverInner.appendChild(pdf)
          break
        default:
          break
      }
      break
    default:
      const contents = await response.text()
      const html = p.parseFromString(contents, "text/html")
      if (html.getElementById("lock")) {popoverElement.remove();return}
      normalizeRelativeURLs(html, targetUrl)
      // prepend all IDs inside popovers to prevent duplicates
      html.querySelectorAll("[id]").forEach((el) => {
        const targetID = `popover-internal-${el.id}`
        el.id = targetID
      })
      const elts = [...html.getElementsByClassName("popover-hint")]
      if (elts.length === 0) {popoverElement.remove();return}

      elts.forEach((elt) => popoverInner.appendChild(elt))
  }

  if(request.signal.aborted || activeAnchor!==link){popoverElement.remove();return}
  request.signal.removeEventListener("abort",cancel)
  void setPosition(popoverElement)
  scrollToHeading(popoverElement)
  popoverInner.querySelectorAll('img').forEach(img=>img.addEventListener('load',()=>void setPosition(popoverElement),{once:true,signal:request.signal}))

}

function clearActivePopover() {
  dismissal.cancel()
  clearTimeout(driveHoverTimer);driveHoverRequest?.abort();driveHoverRequest=undefined
  activeAnchor = null
  const allPopoverElements = document.querySelectorAll(".popover")
  allPopoverElements.forEach((popoverElement) => {
    popoverElement.classList.remove("active-popover")
    hideHoverPanel(popoverElement)
  })
}

document.addEventListener("nav", () => {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-video-reference]')) {
    const bvid = link.dataset.videoReference!
    if (/^BV[0-9A-Za-z]+$/.test(bvid)) window.addCleanup(attachVideoPreview(link, bvid))
  }
  let videoAnchor: HTMLAnchorElement | undefined
  let disposeVideo: (() => void) | undefined
  const resetVideo = () => {
    disposeVideo?.()
    disposeVideo = undefined
    videoAnchor = undefined
  }
  // Delegate so links rendered asynchronously get the same preview.
  const enter = (event: MouseEvent) => {
    if(event.target instanceof Element && event.target.closest('.popover')){dismissal.cancel();return}
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a.internal,a[data-drive-hover],a[data-repo-hover]") : null
    if (!link) { if(activeAnchor)dismissal.schedule(); return }
    if (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return
    if (isNavigationLink(link.href, location.href)) return
    if (link.closest(".starbud-markdown") && (!matchMedia("(hover: hover) and (pointer: fine)").matches ||
      link.closest('.agent-chat-message[aria-live="off"]'))) return
    const bvid = link.dataset.starbudVideoPreview
    if (bvid && /^BV[0-9A-Za-z]+$/.test(bvid)) {
      if (videoAnchor === link) return
      clearActivePopover()
      resetVideo()
      videoAnchor = link
      disposeVideo = attachVideoPreview(link, bvid, undefined, { initialHover: true })
      return
    }
    if (videoAnchor && link.closest(".starbud-markdown")) resetVideo()
    dismissal.cancel()
    clearTimeout(driveHoverTimer)
    driveHoverTimer=setTimeout(()=>{
      if(link.isConnected&&link.matches(":hover"))void mouseEnterHandler.call(link,event)
    },250)
  }
  const leave = (event: MouseEvent) => {
    const target=event.target instanceof Element?event.target:null
    if(!target)return
    const popover=target.closest('.popover')
    if(popover){
      if(event.relatedTarget instanceof Node && (popover.contains(event.relatedTarget)||activeAnchor?.contains(event.relatedTarget)))return
      // Entering the iframe's own document is still inside this preview.
      if(target instanceof HTMLIFrameElement && event.relatedTarget===null)return
      dismissal.schedule();return
    }
    const link=target.closest<HTMLAnchorElement>("a.internal,a[data-drive-hover],a[data-repo-hover]")
    if(!link || event.relatedTarget instanceof Node && link.contains(event.relatedTarget))return
    clearTimeout(driveHoverTimer)
    if(event.relatedTarget instanceof Element && event.relatedTarget.closest('.popover')){dismissal.cancel();return}
    dismissal.schedule()
  }
  document.addEventListener("mouseover", enter)
  document.addEventListener("mouseout", leave)
  const closeDialogPreview = (event: Event) => {
    const dialog = event.target
    if (!(dialog instanceof HTMLDialogElement) || dialog.open) return
    if (activeAnchor && dialog.contains(activeAnchor)) clearActivePopover()
    if (videoAnchor && dialog.contains(videoAnchor)) resetVideo()
    dialog.querySelectorAll(".starbud-hover-panel").forEach(node=>node.remove())
  }
  document.addEventListener("close", closeDialogPreview, true)
  const scrollDialogPreview = (event: Event) => {
    if (!(event.target instanceof Element)) return
    if (activeAnchor?.closest(".starbud-markdown") && event.target.contains(activeAnchor)) clearActivePopover()
    if (videoAnchor && event.target.contains(videoAnchor)) resetVideo()
  }
  document.addEventListener("scroll", scrollDialogPreview, true)
  window.addCleanup(() => {
    document.removeEventListener("mouseover", enter)
    document.removeEventListener("mouseout", leave)
    document.removeEventListener("close", closeDialogPreview, true)
    document.removeEventListener("scroll", scrollDialogPreview, true)
    resetVideo()
    clearActivePopover()
    document.querySelectorAll('.drive-popover,.repo-popover').forEach(node=>node.remove())
  })
})
