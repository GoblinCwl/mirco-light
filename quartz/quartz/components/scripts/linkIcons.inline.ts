import {readContentCatalog,peekContentCatalog,type ContentCatalog} from "./contentCatalog"
import {linkIconKind,linkIconSVG,articleLinkRoutes} from '../../util/linkIcons'

const bodySelector='body:not([data-slug="index"]) .center article.popover-hint,body:not([data-slug="index"]) .center article#content,.center .repo-markdown,.center .drive-metadata,.center .drive-media-overview'

function decorate(link:HTMLAnchorElement,articles?:ReadonlySet<string>){
 if(!(link instanceof HTMLAnchorElement))return
 if(!link.closest(bodySelector)||link.closest('.sidebar,.backlinks,.toc,.page-header,.page-footer,.popover,.home-tiles,.home-hitokoto')){link.querySelectorAll('[data-link-icon]').forEach(icon=>icon.remove());return}
 const href=link.getAttribute('href')||'',kind=linkIconKind(href,location.href,articles)
 link.querySelectorAll('.external-icon').forEach(icon=>icon.remove())
 const own=link.querySelector<SVGElement>('svg[data-link-icon]')
 if(!kind){own?.remove();return}
 if(!articles&&kind==='internal')return
 if(own?.dataset.linkIcon===kind&&own.dataset.linkIconVersion==='3')return
 // Existing illustrations and control icons already identify their links.
 if(link.querySelector('img,picture,canvas')||[...link.querySelectorAll('svg')].some(svg=>!svg.hasAttribute('data-link-icon')&&!svg.closest('.encrypted-mark')))return
 const previous=link.previousElementSibling
 if(previous?.matches('svg,.home-link-icon')&&!own)return
 const icon=linkIconSVG(href,location.href,articles);if(!icon)return
 own?.remove()
 const walker=document.createTreeWalker(link,NodeFilter.SHOW_TEXT)
 let text:Node|null
 while((text=walker.nextNode())){
  if(!text.textContent?.trim()||text.parentElement?.closest('[hidden],.sr-only,[aria-hidden="true"]'))continue
  const template=document.createElement('template');template.innerHTML=icon
  text.parentNode?.insertBefore(template.content,text)
  return
 }
}

document.addEventListener('nav',()=>{
 const controller=new AbortController()
 const routes=(catalog:ContentCatalog)=>articleLinkRoutes(Object.values(catalog.pages).filter(page=>page.type==='article').flatMap(page=>[page.slug,...(Array.isArray(page.extra?.aliases)?page.extra.aliases:[])]))
 const cached=peekContentCatalog();let articles=cached?routes(cached):undefined
 const pending=new Set<HTMLAnchorElement>();let queued=false
 const collect=(node:Node)=>{
  if(!(node instanceof Element))return
  if(node.matches('a[href]'))pending.add(node as HTMLAnchorElement)
  node.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link=>pending.add(link))
 }
 const flush=()=>{queued=false;for(const link of pending)if(link.isConnected)decorate(link,articles);pending.clear()}
 collect(document.body);flush()
 void readContentCatalog({signal:controller.signal}).then(catalog=>{if(!controller.signal.aborted){articles=routes(catalog);collect(document.body);flush()}}).catch(()=>{if(!controller.signal.aborted){articles=new Set();collect(document.body);flush()}})
 const observer=new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes')collect(record.target)
   else {record.addedNodes.forEach(collect);const link=record.target instanceof Element?record.target.closest<HTMLAnchorElement>('a[href]'):null;if(link)pending.add(link)}
  }
  if(pending.size&&!queued){queued=true;queueMicrotask(flush)}
 })
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['href']})
 window.addCleanup(()=>{controller.abort();observer.disconnect();pending.clear()})
})
