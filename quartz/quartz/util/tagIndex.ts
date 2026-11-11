import {getAllSegmentPrefixes} from './path'
import {escapeHTML} from './escape'
export type TagCount = {tag:string;count:number}
export type TagStats = {counts:TagCount[];pageCount:number}
const compare=(a:TagCount,b:TagCount)=>a.tag.localeCompare(b.tag,'zh-CN',{numeric:true})
export function collectTagStats(pages:{tags?:readonly string[]}[],base?:TagStats):TagStats{
 const counts=new Map((base?.counts??[]).map(item=>[item.tag,item.count]))
 let pageCount=base?.pageCount??0
 for(const page of pages){
  const tags=new Set((page.tags??[]).filter(Boolean).flatMap(getAllSegmentPrefixes))
  if(tags.size)pageCount++
  for(const tag of tags)counts.set(tag,(counts.get(tag)??0)+1)
 }
 return {counts:[...counts].map(([tag,count])=>({tag,count})).sort(compare),pageCount}
}
export const tagIndexHref=(tag:string)=>`/tags/${tag.split('/').map(encodeURIComponent).join('/')}/`
export function renderTagRanking(stats:TagStats):string{
 const top=[...stats.counts].sort((a,b)=>b.count-a.count||compare(a,b)).slice(0,10)
 const max=top[0]?.count||1
 return `<ol class="tag-ranking">${top.map(({tag,count},index)=>`<li><a class="internal tag-ranking-link" data-no-popover="true" data-tag-locate="${escapeHTML(tag)}" href="${escapeHTML(tagIndexHref(tag))}" aria-label="${escapeHTML(tag)}，${count} 篇内容"><span class="tag-ranking-number">${String(index+1).padStart(2,'0')}</span><span class="tag-ranking-label">${escapeHTML(tag)}</span><span class="tag-ranking-count">${count}</span><span class="tag-ranking-track" aria-hidden="true"><span style="width:${Math.round(count/max*100)}%"></span></span></a></li>`).join('')}</ol>`
}
export function renderTagIndex(stats:TagStats):string{
 if(!stats.counts.length)return '<p class="tag-index-empty">暂无标签，添加文章标签后会显示在这里。</p>'
 const tags=stats.counts.map(({tag,count},index)=>{
  const parts=tag.split('/'),parent=parts.slice(0,-1).join('/')
  const angle=[-3,2,-1,3,-2,1.5,-2.5,2.5][index%8]
  const offset=[2,20,8,26,0,15,5][index%7]
  return `<li class="tag-echo-entry" data-tag-name="${escapeHTML(tag)}" style="--slip-angle:${angle}deg;--slip-offset:${offset}px"><a class="internal tag-index-link" data-no-popover="true" href="${escapeHTML(tagIndexHref(tag))}" aria-label="${escapeHTML(tag)}，${count} 篇内容"><svg class="tag-slip-paper" viewBox="0 0 180 120" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M14 .7H179.3V119.3H.7V14Z"/></svg><svg class="tag-slip-cord" viewBox="0 0 48 42" fill="none" aria-hidden="true"><path d="M21 32C36 11 32 0 21 5S6 19 21 32Z"/><circle cx="21" cy="32" r="3.2"/></svg>${parent?`<span class="tag-echo-parent">${escapeHTML(parent)}</span>`:''}<span class="tag-index-name">${escapeHTML(parts.at(-1)!)}</span><span class="tag-slip-foot"><span class="tag-index-count">${count}<small> 项内容</small></span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 4a8 8 0 1 0 4 13A8 8 0 0 1 16 4Z"/></svg></span></a></li>`
 }).join('')
 return `<section class="tag-mobile-distribution"><header class="tag-index-heading"><h2>回声分布</h2><span>TOP ${Math.min(10,stats.counts.length)}</span></header>${renderTagRanking(stats)}</section><section class="tag-catalog" aria-label="全部标签"><header class="tag-index-heading"><h2>回声</h2><span data-tag-visible-count aria-live="polite">${stats.counts.length} 个主题</span></header><div class="tag-echo"><ul class="tag-echo-labels">${tags}</ul><p class="tag-index-empty" data-tag-empty-filter hidden>没有匹配的标签</p></div></section>`
}
