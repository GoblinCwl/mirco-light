import {driveRoute} from '../../util/driveRoutes.mjs'

// Keep the live canvas only while navigating inside the same authorized share.
export function retainShareGraph(next:Document,destination:URL):()=>void {
 document.querySelectorAll('[data-graph-retained]').forEach(element=>element.removeAttribute('data-graph-retained'))
 const from=driveRoute(new URL(location.href)),to=driveRoute(destination)
 const current=document.querySelector<HTMLElement>('[data-drive-share-graph]:not([hidden])')
 const incoming=next.querySelector<HTMLElement>('[data-drive-share-graph]')
 if(!from.valid||!to.valid||from.view!=='share'||to.view!=='share'||from.share!==to.share||!current?.querySelector('.graph-container[data-graph-ready] canvas')||!incoming)return ()=>{}
 current.dataset.graphRetained=''
 const slot='quartz-retained-share-graph',oldSlot=document.createElement('div'),newSlot=next.createElement('div')
 oldSlot.id=newSlot.id=slot
 current.replaceWith(oldSlot);incoming.replaceWith(newSlot)
 return ()=>{document.getElementById(slot)?.replaceWith(current)}
}
