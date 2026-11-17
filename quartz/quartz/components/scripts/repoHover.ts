import {previewBreadcrumbs} from './previewBreadcrumbs'
import {peekContentCatalog} from './contentCatalog'
import {repoApi,repoRoute,repoHref} from './repoShared'
import {repoCachedRequest} from './repoClient'
import {markdown} from './repoMarkdown'
export function repoHoverAvailable(url:URL) {
  const {name,path}=repoRoute(url)
  return !!name && (!!path || peekContentCatalog()?.pages[`Repo/${name}`]?.extra.hasReadme!==false)
}
export async function repoHoverContent(url:URL,label:string,signal:AbortSignal) {
  const route=repoRoute(url)
  if(!route.name)return null
  const result=await repoCachedRequest<{type?:string;path:string;content:string;sha:string;binary?:boolean;truncated?:boolean}>(repoApi(route.name,route.path?'browse':'readme',{ref:route.ref,...(route.path?{path:route.path}:{})}))
  signal.throwIfAborted()
  if(route.path&&result.type!=='file'||!result.path||!result.content?.trim()||result.binary)return null
  // Bound both Markdown rendering and syntax highlighting on hover.
  const source=result.content.slice(0,16000).split('\n').slice(0,100).join('\n')
  const truncated=result.truncated||source.length<result.content.length
  if(route.path){
    const {driveHoverFile}=await import('./driveHoverFile')
    signal.throwIfAborted()
    const box=document.createElement('div')
    box.className='drive-hover-card'
    const file={name:result.path.split('/').pop()!,is_dir:false,size:new TextEncoder().encode(source).length,modified:'',type:4}
    const address=new URL(repoApi(route.name,'raw',{path:result.path,ref:result.sha}),location.href).href
    box.append(driveHoverFile(file,address,{view:'repo',requestPath:result.path,password:''},signal,{text:source}))
    return box
  }
  const box=document.createElement('article'),title=document.createElement('h1'),body=document.createElement('div')
  const crumbs=[{label:'Home',href:'/'},{label:'Repo',href:'/Repo/'}],language=peekContentCatalog()?.pages[`Repo/${route.name}`]?.extra.language
  if(language)crumbs.push({label:String(language),href:repoHref('',{language:String(language)})})
  crumbs.push({label:route.name,href:repoHref(route.name,{ref:route.ref})})
  body.className='repo-markdown';box.className='repo-hover-card';title.className='article-title';title.textContent=label||route.name;box.append(previewBreadcrumbs(crumbs),title,body)
  if(/\.(md|markdown|mdown)$/i.test(result.path))await markdown(body,source,result.path,{name:route.name},result.sha,signal,false)
  else {const pre=document.createElement('pre');pre.textContent=source;body.append(pre)}
  if(truncated){const notice=document.createElement('p');notice.className='repo-notice';notice.textContent='仅预览部分内容，打开链接查看完整文件。';box.append(notice)}
  signal.throwIfAborted()
  return box
}
