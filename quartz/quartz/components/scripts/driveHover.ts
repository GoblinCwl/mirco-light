import { RequestCache } from './sharedRequest'
import { drivePreviewSettings, setupDrivePreview } from './drivePreview'
import { fileHoverSupported } from './driveHoverPolicy'
import {previewBreadcrumbs} from './previewBreadcrumbs'
import {readDriveShareRoot} from "./driveShareSummary"
import { driveHref, drivePassword, driveRequest, driveRoute, driveToken, requireDriveUser, DriveError } from './driveClient'
import { fetchDriveEntries } from './driveEntries'
import { fetchDriveAliases } from './driveAliases'
import { DRIVE_ORIGIN, driveDownloadUrl, driveGuestFileUrl, joinDrivePath, type DriveFile } from './openlistShared'
import { fileIcon, fileIconForName, node } from './driveUi'

type Preview = { title:string; entries?:{name:string;href:string;directory:boolean;portal?:boolean}[]; total?:number; message?:string }
const metadata=new RequestCache<DriveFile>(60000,80)
const cache=new Map<string,{at:number;value:Preview}>()
for(const event of ['drive-auth-change','drive-directory-unlocked','drive-files-changed']) document.addEventListener(event,()=>{cache.clear();metadata.clear()})
async function hoverMetadata(url:URL,signal:AbortSignal):Promise<DriveFile> {
 const route=driveRoute(url)
 if(!route.valid)throw new Error('无效链接')
 const password=drivePassword(route.view,route.share,route.path)
 const requestPath=route.view==='share'?`/@s/${route.share}${route.path==='/'?'':route.path}`:route.path
 return metadata.read(JSON.stringify([route.view,requestPath,driveToken(),password]),requestSignal=>driveRequest<DriveFile>('fs/get',{path:requestPath,password},{anonymous:route.view!=='storage',signal:requestSignal,timeout:10000}),{signal})
}
export async function driveHoverAllowed(url:URL,allowMedia=false,signal:AbortSignal=AbortSignal.timeout(10000)):Promise<boolean>{
  const route=driveRoute(url)
  if(!route.valid)return false
  try{
    if(route.view==='share'){
      const entry=(await fetchDriveEntries()).find(entry=>entry.kind==='share'&&entry.id===route.share)
      if(!(entry?.kind==='share'&&(allowMedia||!entry.jellyfin)&&(!entry.protected||Boolean(drivePassword('share',route.share,route.path)))))return false
    }else if(route.view==='storage'&&!driveToken())return false
    const file=await hoverMetadata(url,signal)
    if(file.is_dir)return true
    const config=await drivePreviewSettings(signal).catch(()=>({}))
    return fileHoverSupported(file,config,route.view==='share')
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
    if(route.view==='share'&&!await driveHoverAllowed(url,allowMedia,signal))return null
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
      const meta=await hoverMetadata(url,signal)
      if(!meta.is_dir){
        const config=await drivePreviewSettings(signal).catch(()=>({}))
        if(!fileHoverSupported(meta,config,view==='share'))return null
        const wrapper=node('div','','drive-page drive-hover-file'),chooser=node('div'),select=node('select'),body=node('div')
        body.className='drive-preview-body drive-hover-preview-body'
        wrapper.setAttribute('data-drive-loading-root','')
        const loading=node('span','','drive-loading-overlay')
        loading.setAttribute('data-drive-page-loading','');loading.setAttribute('role','status');loading.setAttribute('aria-label','正在加载文件预览')
        loading.innerHTML='<span class="drive-loading-badge"><span class="drive-loading" aria-hidden="true"><svg class="drive-loading-progress" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" pathLength="100"/></svg><i></i></span></span>'
        chooser.hidden=true;chooser.append(select);wrapper.append(chooser,body,loading);box.append(wrapper)
        const direct=view==='share'?new URL(`/sd/${encodeURIComponent(share)}${path==='/'?'':path.split('/').map(encodeURIComponent).join('/')}`,DRIVE_ORIGIN):undefined
        if(direct&&password)direct.searchParams.set('pwd',password)
        const address=direct?.href||(view==='guest'?driveGuestFileUrl(meta):driveDownloadUrl(joinDrivePath(user?.base_path||'/',path),meta.sign))
        const preview=setupDrivePreview(body,signal,{chooser,hover:true})
        void preview.load(meta,address,{view,requestPath,password,user},signal).catch(()=>{})
        return box
      }
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
