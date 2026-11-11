import {previewBreadcrumbs} from './previewBreadcrumbs'
import {peekContentCatalog} from './contentCatalog'
import {repoApi,repoRoute,repoHref} from './repoShared'
import {repoCachedRequest} from './repoClient'
import {markdown} from './repoMarkdown'
export function repoHoverAvailable(url:URL) {
  const name=repoRoute(url).name
  return !!name && peekContentCatalog()?.pages[`Repo/${name}`]?.extra.hasReadme!==false
}
export async function repoHoverContent(url:URL,label:string,signal:AbortSignal) {
  const route=repoRoute(url)
  if(!route.name)return null
  const result=await repoCachedRequest<{path:string;content:string;sha:string;binary?:boolean}>(repoApi(route.name,'readme',{}))
  signal.throwIfAborted()
  if(!result.path||!result.content?.trim()||result.binary)return null
  const box=document.createElement('article'),title=document.createElement('h1'),body=document.createElement('div')
  const crumbs=[{label:'Home',href:'/'},{label:'Repo',href:'/Repo/'}],language=peekContentCatalog()?.pages[`Repo/${route.name}`]?.extra.language
  if(language)crumbs.push({label:String(language),href:repoHref('',{language:String(language)})})
  crumbs.push({label:route.name,href:url.pathname+url.search})
  box.className='repo-hover-card';title.className='article-title';title.textContent=label||route.name;box.append(previewBreadcrumbs(crumbs),title,body)
  if(/\.(md|markdown|mdown)$/i.test(result.path))await markdown(body,result.content,result.path,{name:route.name},result.sha,signal,false)
  else {const pre=document.createElement('pre');pre.textContent=result.content;body.append(pre)}
  signal.throwIfAborted()
  return box
}
