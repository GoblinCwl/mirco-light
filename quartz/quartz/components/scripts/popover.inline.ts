import { attachVideoPreview } from "./videoPreview"
import {repoHoverContent,repoHoverAvailable} from "./repoHover"
import { computePosition, flip, inline, shift } from "@floating-ui/dom"
import { normalizeRelativeURLs } from "../../util/path"
import { fetchCanonical } from "./util"
import { driveHoverAllowed, driveHoverContent } from "./driveHover"

function previewLoading() {
  const loading=document.createElement('div');loading.className='hover-preview-loading';loading.setAttribute('role','status')
  loading.innerHTML='<span class="drive-loading" aria-hidden="true"><i></i></span><span>正在加载预览…</span>'
  return loading
}
const p = new DOMParser()
let activeAnchor: HTMLAnchorElement | null = null
let driveHoverTimer: ReturnType<typeof setTimeout> | undefined
let driveHoverRequest: AbortController | undefined
for(const event of ['drive-auth-change','drive-directory-unlocked','drive-files-changed'])document.addEventListener(event,()=>{
  clearActivePopover();document.querySelectorAll('.drive-popover,.repo-popover').forEach(node=>node.remove())
})

async function showDriveHover(link:HTMLAnchorElement,event:{clientX:number;clientY:number},repo=false) {
  clearActivePopover();
  if(repo&&!repoHoverAvailable(new URL(link.href)))return
  activeAnchor=link
  const eligibility=repo?Promise.resolve(true):driveHoverAllowed(new URL(link.href),Boolean(link.closest('.home-encounter,.tag-project-dialog')))
  {
    const request=driveHoverRequest=new AbortController()
    const allowMedia=Boolean(link.closest('.home-encounter,.tag-project-dialog'))
    if(!await eligibility||request.signal.aborted||activeAnchor!==link)return
    document.querySelectorAll('.drive-popover,.repo-popover').forEach(node=>node.remove())
    const popover=document.createElement('div'),inner=document.createElement('div')
    popover.className=`popover ${repo?'repo-popover':'drive-popover'} active-popover`;inner.className='popover-inner';popover.append(inner)
    const position=async()=>{
      const {x,y}=await computePosition(link,popover,{strategy:'fixed',middleware:[inline({x:event.clientX,y:event.clientY}),shift({padding:8}),flip()]})
      if(!request.signal.aborted)popover.style.transform=`translate(${x.toFixed()}px,${y.toFixed()}px)`
    }
    inner.append(previewLoading());(link.closest("dialog[open]")||document.body).append(popover);void position()
    const cancel=()=>popover.remove();request.signal.addEventListener('abort',cancel,{once:true})
    try{
      const url=new URL(link.href),label=link.textContent?.trim()||link.getAttribute('aria-label')||''
      const content=await (repo?repoHoverContent(url,label,request.signal):driveHoverContent(url,label,request.signal,allowMedia))
      if(request.signal.aborted||activeAnchor!==link)return
      if(!content){popover.remove();return}
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

  function showPopover(popoverElement: HTMLElement) {
    const host=link.closest("dialog[open]")||document.body
    if(popoverElement.parentElement!==host)host.append(popoverElement)
    document.querySelectorAll('.active-popover').forEach(node=>node.classList.remove('active-popover'))
    popoverElement.classList.add("active-popover")
    setPosition(popoverElement as HTMLElement)

    if (hash !== "") {
      const targetAnchor = `#popover-internal-${hash.slice(1)}`
      const heading = popoverInner.querySelector(targetAnchor) as HTMLElement | null
      if (heading) {
        // leave ~12px of buffer when scrolling to a heading
        popoverInner.scroll({ top: heading.offsetTop - 12, behavior: "instant" })
      }
    }
  }

  const targetUrl = new URL(link.href)
  const hash = decodeURIComponent(targetUrl.hash)
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
  ;(link.closest("dialog[open]")||document.body).append(popoverElement)
  showPopover(popoverElement)
  const cancel=()=>popoverElement.remove()
  request.signal.addEventListener("abort",cancel,{once:true})
  const response = await fetchCanonical(targetUrl,{signal:request.signal}).catch(()=>undefined)
  if (!response || request.signal.aborted || activeAnchor!==link) {popoverElement.remove();return}
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
  popoverInner.querySelectorAll('img').forEach(img=>img.addEventListener('load',()=>void setPosition(popoverElement),{once:true,signal:request.signal}))

}

function clearActivePopover() {
  clearTimeout(driveHoverTimer);driveHoverRequest?.abort();driveHoverRequest=undefined
  activeAnchor = null
  const allPopoverElements = document.querySelectorAll(".popover")
  allPopoverElements.forEach((popoverElement) => popoverElement.classList.remove("active-popover"))
}

document.addEventListener("nav", () => {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-video-reference]')) {
    const bvid = link.dataset.videoReference!
    if (/^BV[0-9A-Za-z]+$/.test(bvid)) window.addCleanup(attachVideoPreview(link, bvid))
  }
  // Delegate so links rendered asynchronously (such as 拾遗) get the same preview.
  const enter = (event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a.internal,a[data-drive-hover],a[data-repo-hover]") : null
    if (!link || event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return
    clearTimeout(driveHoverTimer)
    driveHoverTimer=setTimeout(()=>void mouseEnterHandler.call(link,event),250)
  }
  const leave = (event: MouseEvent) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a.internal,a[data-drive-hover],a[data-repo-hover]") : null
    if (!link || event.relatedTarget instanceof Node && link.contains(event.relatedTarget)) return
    clearActivePopover()
  }
  document.addEventListener("mouseover", enter)
  document.addEventListener("mouseout", leave)
  window.addCleanup(() => {
    document.removeEventListener("mouseover", enter)
    document.removeEventListener("mouseout", leave)
    clearActivePopover()
    document.querySelectorAll('.drive-popover,.repo-popover').forEach(node=>node.remove())
  })
})
