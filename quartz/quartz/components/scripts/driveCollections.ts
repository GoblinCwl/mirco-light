import { driveHref } from './driveClient'
import { node } from './driveUi'
import type { MediaCollection } from './driveMediaView'

export function setupDriveCollections(root:HTMLElement,signal:AbortSignal){
  const section=root.querySelector<HTMLElement>('[data-drive-collections]')!
  let signature=''
  return (groups:MediaCollection[]|undefined,share:string,enabled:boolean)=>{
    section.hidden=!enabled||!groups?.length
    if(section.hidden)return
    const key=JSON.stringify([share,groups!.map(group=>[group.id,group.title,group.items.map(item=>[item.id,item.title,item.year,item.path,Boolean(item.poster)])])])
    if(key===signature)return
    signature=key;section.replaceChildren(node('h3','相关作品'))
    for(const group of groups!){
      const block=node('div','','drive-collection-group'),title=node('h4',group.title),list=node('div','','drive-collection-list');block.append(title,list)
      for(const item of group.items){
        const link=node('a','','internal drive-collection-link'),artwork=node('span',Array.from(item.title)[0]||'','drive-collection-artwork'),copy=node('span','','drive-collection-copy')
        link.href=driveHref('share',item.path,share,item.directory);link.dataset.noPopover='true';link.title=item.title
        if(item.poster){const image=node('img');image.alt='';image.loading='lazy';image.decoding='async';artwork.classList.add('is-loading');image.addEventListener('load',()=>{artwork.classList.remove('is-loading');image.classList.add('is-ready')},{once:true,signal});image.addEventListener('error',()=>{artwork.classList.remove('is-loading');image.remove()},{once:true,signal});image.src=item.poster;artwork.append(image)}
        copy.append(node('strong',item.title));if(item.year)copy.append(node('small',String(item.year)))
        link.append(artwork,copy);list.append(link)
      }
      section.append(block)
    }
  }
}
