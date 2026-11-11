import {previewBreadcrumbs} from './previewBreadcrumbs'
import {readDriveShareRoot} from "./driveShareSummary"
import { driveHref, drivePassword, driveRequest, driveRoute, driveToken, requireDriveUser, DriveError } from './driveClient'
import { fetchDriveEntries } from './driveEntries'
import { fetchDriveAliases } from './driveAliases'
import { joinDrivePath, type DriveFile } from './openlistShared'
import { fileIcon, fileIconForName, node } from './driveUi'

type Preview = { title:string; entries?:{name:string;href:string;directory:boolean;portal?:boolean}[]; total?:number; message?:string }
const cache=new Map<string,{at:number;value:Preview}>()
for(const event of ['drive-auth-change','drive-directory-unlocked','drive-files-changed']) document.addEventListener(event,()=>cache.clear())
export async function driveHoverAllowed(url:URL,allowMedia=false):Promise<boolean>{
  const route=driveRoute(url)
  if(!route.valid)return false
  if(route.view!=='share')return true
  try{
    const entry=(await fetchDriveEntries()).find(entry=>entry.kind==='share'&&entry.id===route.share)
    return entry?.kind==='share'&&(allowMedia||!entry.jellyfin)&&(!entry.protected||Boolean(drivePassword('share',route.share,route.path)))
  }catch{return false}
}
export async function driveHoverContent(url:URL,label:string,signal:AbortSignal,allowMedia=false):Promise<HTMLElement|null>{
  let route=driveRoute(url)
  const box=node('div','','drive-hover-card')
  const render=(value:Preview)=>{
    const header=node('div','','popover-hint'),heading=node('h1',value.title,'article-title')
    const crumbs=[{label:'Home',href:'/'},{label:'Share',href:'/Share/'}]
    if(route.view==='share')crumbs.push({label:route.share,href:driveHref('share','/',route.share,true)})
    const segments=route.path.split('/').filter(Boolean)
    for(let index=0;index<segments.length;index++)crumbs.push({label:segments[index],href:driveHref(route.view,'/'+segments.slice(0,index+1).join('/'),route.share,true)})
    box.append(previewBreadcrumbs(crumbs));header.append(heading);box.append(header)
    const content=node('div','','popover-hint directory-page'),listing=node('div','','page-listing')
    if(value.message)listing.append(node('p',value.message))
    else {
      listing.append(node('p',`此目录下有 ${value.total||0} 项。`))
      const list=node('table','','directory-table'),head=node('thead'),labels=node('tr'),body=node('tbody')
      for(const [text,kind]of [['类型','drive-kind-cell'],['名称','drive-name-cell']]){const cell=node('th','',kind);cell.append(node('span',text,'directory-column-label'));labels.append(cell)}
      head.append(labels);list.append(head,body)
      for(const entry of value.entries||[]){
        const item=node('tr'),icon=node('td','','drive-kind-cell'),name=node('td','','drive-name-cell'),link=node('a','','internal drive-file-open')
        link.href=entry.href;link.dataset.noPopover='true';link.append(node('span',entry.name,'drive-file-name'))
        icon.append(entry.portal?fileIcon("space"):fileIconForName(entry.name,entry.directory));name.append(link);item.append(icon,name);body.append(item)
      }
      listing.append(list)
    }
    content.append(listing);box.append(content);return box
  }
  try{
    if(!route.valid)throw new Error('无效链接')
    if(route.view==='share'&&!await driveHoverAllowed(url,allowMedia))return null
    const user=route.view==='storage'?await requireDriveUser(signal):undefined
    if(user)route=driveRoute(url)
    if(!route.valid)throw new Error('目录不可访问')
    const {view,share,path}=route,password=drivePassword(view,share,path),token=driveToken()
    const key=JSON.stringify([url.pathname,view==='storage'?token:'',password])
    const hit=cache.get(key);if(hit&&Date.now()-hit.at<60000)return render(hit.value)
    const options={anonymous:view!=='storage',signal,timeout:10000}
    let value:Preview
    {
      const requestPath=view==='share'?`/@s/${share}${path==='/'?'':path}`:path
      const root=view==='share'&&path==='/'?await readDriveShareRoot(share,signal):undefined
      const meta=root?{is_dir:!root.isFile,name:share}:await driveRequest<DriveFile>('fs/get',{path:requestPath,password},options)
      if(!meta.is_dir)return null
      const aliases=view==='share'?await fetchDriveAliases(share,signal,path).catch(()=>({} as Record<string,string>)):{}
      const title=view==='share'&&path==='/'?share:aliases[path]||label||meta.name
      value={title}
      {
        const listing=root|| (view==='storage'&&path==='/'?{content:(await driveRequest<DriveFile[]>('fs/dirs',{path:'/',password},options)).map(file=>({...file,is_dir:true})),total:0}:await driveRequest<{content:DriveFile[]|null;total:number}>('fs/list',{path:requestPath,password,page:1,per_page:6,refresh:false},options))
        const files=listing.content||[];value.total=listing.total||files.length
        value.entries=files.slice(0,6).map(file=>{const child=joinDrivePath(path,file.name);return {name:aliases[child]||file.name,href:driveHref(view,child,share,file.is_dir),directory:file.is_dir}})
        if(view==='guest'&&path==='/'){
          value.entries.unshift({name:'空间',href:driveHref('storage'),directory:true,portal:true})
          value.entries=value.entries.slice(0,6);value.total+=1
        }
      }
    }
    signal.throwIfAborted();if(cache.size>=80)cache.delete(cache.keys().next().value!);cache.set(key,{at:Date.now(),value})
    return render(value)
  }catch(error){
    signal.throwIfAborted()
    if(error instanceof DriveError&&[401,403].includes(error.code))return null
    return render({title:label||route.share||'Drive',message:'暂时无法预览，点击进入页面'})
  }
}
