import path from 'node:path'
import {fromHtml} from 'hast-util-from-html'
import {toHtml} from 'hast-util-to-html'
import {visit} from 'unist-util-visit'
import {FullSlug,isRelativeURL,simplifySlug} from '../../util/path'

export function aliasSlugs(slug:FullSlug,aliases:FullSlug[]=[]):FullSlug[]{
 const original=simplifySlug(slug)
 return [...new Set(aliases.map(alias=>(isRelativeURL(alias)?path.posix.normalize(path.posix.join(original,'..',alias)):alias).replace(/^\/+/,'')))].filter(alias=>alias!==slug&&alias!==original) as FullSlug[]
}

/** Retain canonical article identity while making its URLs independent of alias depth. */
export function aliasPageHTML(html:string,slug:FullSlug):string {
 const tree=fromHtml(html),base=new URL('/'+slug,'https://alias.invalid')
 visit(tree,'element',node=>{
  for(const key of ['href','src','poster','action','dataPayloadUrl','dataUrl','dataSrc']){
   const value=node.properties[key]
   if(typeof value!=='string'||!value||/^(?:#|\/|[a-z][a-z\d+.-]*:)/i.test(value))continue
   const url=new URL(value,base)
   node.properties[key]=url.pathname+url.search+url.hash
  }
  if(node.tagName==='body')node.properties.dataContentBase=base.pathname
  if(node.tagName==='head')node.children.push({type:'element',tagName:'link',properties:{rel:['canonical'],href:base.pathname},children:[]})
 })
 return toHtml(tree,{allowDangerousHtml:true})
}
