import {tagHref} from './tagLink'
import {getAllSegmentPrefixes} from './path'
import {escapeHTML} from './escape'
import {tagClusterStyle} from './tagClusters'
export type TagCount = {tag:string;count:number;members?:string[]}
type TagPage = {tags?:readonly string[];id?:string;slug?:string}
export type TagStats = {counts:TagCount[];pageCount:number}
const compare=(a:TagCount,b:TagCount)=>a.tag.localeCompare(b.tag,'zh-CN',{numeric:true})
export function collectTagStats(pages:TagPage[],base?:TagStats):TagStats{
 const counts=new Map((base?.counts??[]).map(item=>[item.tag,item.count]))
 const members=new Map((base?.counts??[]).map(item=>[item.tag,[...(item.members??[])]]))
 const seen=new Set((base?.counts??[]).flatMap(item=>(item.members??[])).filter(id=>!id.startsWith('item:')))
 let pageCount=base?.pageCount??0
 for(const page of pages){
  const identity=page.id||page.slug
  if(identity&&seen.has(identity))continue
  if(identity)seen.add(identity)
  const tags=new Set((page.tags??[]).filter(Boolean).flatMap(getAllSegmentPrefixes))
  if(tags.size)pageCount++
  const member=identity||`item:${pageCount}`
  for(const tag of tags){counts.set(tag,(counts.get(tag)??0)+1);const list=members.get(tag)??[];list.push(member);members.set(tag,list)}
 }
 return {counts:[...counts].map(([tag,count])=>({tag,count,members:members.get(tag)??[]})).sort(compare),pageCount}
}
export const tagIndexHref=tagHref
export function renderTagNavigation(stats:TagStats):string{
 const tags=[...stats.counts].sort((a,b)=>b.count-a.count||compare(a,b))
 if(!tags.length)return '<p class="tag-navigation-empty">暂无标签</p>'
 return `<ul class="tag-navigation-list">${tags.map(({tag,count})=>`<li><a class="internal tag-navigation-link" style="${tagClusterStyle(tag)}" data-no-popover="true" data-tag-locate="${escapeHTML(tag)}" aria-haspopup="dialog" aria-controls="tag-project-dialog" href="${escapeHTML(tagIndexHref(tag))}" title="${escapeHTML(tag)}" aria-label="定位星团：${escapeHTML(tag)}，${count} 项内容"><span class="tag-navigation-name">${escapeHTML(tag)}</span><span class="tag-navigation-count">${count}</span></a></li>`).join('')}</ul>`
}
export function renderTagIndex(stats:TagStats):string{
 if(!stats.counts.length)return '<p class="tag-index-empty">暂无标签，添加文章标签后会显示在这里。</p>'
 const tags=stats.counts.map(({tag,count})=>`<li class="tag-nebula-entry" data-tag-name="${escapeHTML(tag)}" style="${tagClusterStyle(tag)}"><div class="tag-cluster-label"><a class="internal tag-index-link" data-no-popover="true" aria-haspopup="dialog" aria-controls="tag-project-dialog" href="${escapeHTML(tagIndexHref(tag))}" aria-label="${escapeHTML(tag)}，${count} 项内容"><span class="tag-index-name">${escapeHTML(tag)}</span><span class="tag-cluster-count">${count}</span></a></div></li>`).join('')
 return `<section class="tag-catalog" aria-label="全部标签"><div class="tag-nebula" data-tag-nebula><canvas class="tag-nebula-canvas" aria-hidden="true"></canvas><ul class="tag-nebula-labels">${tags}</ul></div></section>`
}
