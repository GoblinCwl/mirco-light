import {getAllSegmentPrefixes} from './path'
type Project={id?:string;slug?:string;title:string;tags:readonly string[];updatedAt?:string;createdAt?:string}
export function tagProjects<T extends Project>(pages:T[],tag:string):T[] {
 const seen=new Set<string>()
 return pages.filter(page=>{
  const key=page.id||page.slug
  if(key&&seen.has(key))return false
  if(!page.tags.some(value=>getAllSegmentPrefixes(value).includes(tag)))return false
  if(key)seen.add(key)
  return true
 }).sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||'')||0)-(Date.parse(a.updatedAt||a.createdAt||'')||0)||a.title.localeCompare(b.title,'zh-CN',{numeric:true}))
}
