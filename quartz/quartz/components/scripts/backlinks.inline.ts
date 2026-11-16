import { attachVideoPreview } from "./videoPreview"
import { readContentCatalog } from "./contentCatalog"
import { contentBacklinks, currentContent } from "../../util/contentRelations"
import { encryptedIcon } from "../../util/encryptedIcon"

document.addEventListener("nav",()=>{
 const roots=[...document.querySelectorAll<HTMLElement>("[data-backlinks]")]
 if(!roots.length)return
 const controller=new AbortController()
 let previewCleanups:(()=>void)[]=[]
 let revision=0
 const render=async(refresh=false)=>{
  const own=++revision
  try{
   const catalog=await readContentCatalog({signal:controller.signal,refresh})
   if(controller.signal.aborted||own!==revision)return
   const target=currentContent(catalog,location.href,document.body.dataset.slug)
   const pages=target?contentBacklinks(catalog,target.slug):[]
   previewCleanups.forEach(cleanup=>cleanup());previewCleanups=[]
   for(const root of roots){
    const list=root.querySelector('ul')!,fragment=document.createDocumentFragment()
    for(const page of pages){
     const row=document.createElement('li'),link=document.createElement('a')
     link.href=page.href;link.className='internal';link.dataset.slug=page.slug
     if(page.encrypted){const mark=document.createElement('span');mark.className='encrypted-mark';mark.setAttribute('role','img');mark.setAttribute('aria-label','已加密');mark.innerHTML=encryptedIcon;link.append(mark);link.dataset.noPopover='true'}
     else if(page.type==='repo')link.dataset.repoHover='true'
     else if(page.type==='video'){link.dataset.noPopover='true';previewCleanups.push(attachVideoPreview(link,page.slug.slice('Video/'.length)))}
     link.append(document.createTextNode(page.title));row.append(link)
     fragment.append(row)
    }
    list.replaceChildren(fragment);root.hidden=!target||!pages.length&&root.dataset.hideEmpty!=='false'
   }
   document.dispatchEvent(new Event("backlinks-updated"))
  }catch{if(!controller.signal.aborted)roots.forEach(root=>root.hidden=true)}
 }
 document.addEventListener("content-route-changed",()=>void render(),{signal:controller.signal})
 const update=()=>void render(true)
 for(const event of ['drive-files-changed','stellar-data-changed','content-tags-changed'])document.addEventListener(event,update,{signal:controller.signal})
 void render()
 window.addCleanup(()=>{controller.abort();previewCleanups.forEach(cleanup=>cleanup())})
})
