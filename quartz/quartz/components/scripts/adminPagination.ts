import {node} from './driveUi'
export function renderAdminPagination(root:HTMLElement,page:number,pages:number,total:number,change:(page:number)=>void,note='') {
 root.replaceChildren()
 if(!total)return
 const previous=node('button','上一页'),next=node('button','下一页'),info=node('span',`共 ${total} 条 · ${page} / ${pages}${note?' · '+note:''}`)
 previous.type=next.type='button';previous.disabled=page<=1;next.disabled=page>=pages
 previous.onclick=()=>change(page-1);next.onclick=()=>change(page+1)
 root.append(previous,info,next)
}
