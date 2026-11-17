import {fileTypeIcons,bilibiliVideoIcon,fileIconKind,type FileIconKind} from './fileTypeIcons'

export type LinkIconKind = 'internal' | 'external' | 'article' | 'repo' | 'share' | 'video' | `file-${FileIconKind}`
const externalLink = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6m0-6L10 14"/><path d="M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4"/></svg>'

const internalLink = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 12h10m-4-4 4 4-4 4"/></svg>'

export function linkRoute(path:string):string {
 try{path=decodeURIComponent(path)}catch{ /* Preserve literal percent characters in a slug. */ }
 return path.replace(/^\/+|\/+$/g,'').replace(/\.html$/,'').replace(/(?:^|\/)index$/,'')
}
export function articleLinkRoutes(slugs:Iterable<string>):Set<string>{return new Set([...slugs].map(linkRoute))}


export function linkIconKind(href:string,base:string,articles:ReadonlySet<string>=new Set()):LinkIconKind|undefined {
 if(!href.trim()||href.trim().startsWith('#'))return
 try{
  const site=new URL(base),url=new URL(href,site)
  if(!/^https?:$/.test(url.protocol))return
  if(url.hostname!==site.hostname||url.username||url.password)return 'external'
  const route=linkRoute(url.pathname),parts=route.split('/').filter(Boolean)
  if(!route||/^(?:reading|tags|friends|observatory|archives)(?:\/|$)/.test(route))return 'internal'
  if(articles.has(route))return 'article'
  // File URLs retain their content parent in the index, but use directory icons in prose.
  const filename=parts.length===2&&parts[0]==='Repo'?url.searchParams.get('path'):
    parts[0]==='Share'&&parts.length>=3&&!url.pathname.endsWith('/')&&
    (parts[1]!=='分享'||parts.length>=4)?parts.at(-1):undefined
  if(filename&&!filename.endsWith('/')){
   const kind=fileIconKind(filename)
   if(kind!=='other')return `file-${kind}`
  }
  if(parts.length===2&&parts[0]==='Repo')return 'repo'
  if(parts.length===2&&parts[0]==='Video'&&/^BV[0-9A-Za-z]+$/.test(parts[1]))return 'video'
  if(parts.length===3&&parts[0]==='Share'&&parts[1]==='分享')return 'share'
  return 'internal'

 }catch{return}
}
export function linkIconSVG(href:string,base:string,articles?:ReadonlySet<string>):string|undefined {
 const kind=linkIconKind(href,base,articles);if(!kind)return
 const svg=kind.startsWith('file-')?fileTypeIcons[kind.slice(5) as FileIconKind]:kind==='internal'?internalLink:kind==='external'?externalLink:kind==='video'&&/^\/Video(?:\/|$)/.test(new URL(href,base).pathname)?bilibiliVideoIcon:fileTypeIcons[kind as FileIconKind]
 return svg.replace('<svg ',`<svg class="content-link-icon" data-link-icon="${kind}" data-link-icon-version="4" focusable="false" `)
}
