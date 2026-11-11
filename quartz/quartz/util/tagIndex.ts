import {homeIcons} from '../home/icons'
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
 return `<ol class="tag-ranking">${top.map(({tag,count},index)=>`<li><a class="internal tag-ranking-link" data-no-popover="true" href="${escapeHTML(tagIndexHref(tag))}" aria-label="${escapeHTML(tag)}，${count} 篇内容"><span class="tag-ranking-number">${String(index+1).padStart(2,'0')}</span><span class="tag-ranking-label">${escapeHTML(tag)}</span><span class="tag-ranking-count">${count}</span><span class="tag-ranking-track" aria-hidden="true"><span style="width:${Math.round(count/max*100)}%"></span></span></a></li>`).join('')}</ol>`
}
export function renderTagIndex(stats:TagStats):string{
 if(!stats.counts.length)return '<p class="tag-index-empty">暂无标签，添加文章标签后会显示在这里。</p>'
 const tags=stats.counts.map(({tag,count})=>`<li data-tag-name="${escapeHTML(tag)}"><a class="internal tag-index-link" data-no-popover="true" href="${escapeHTML(tagIndexHref(tag))}"><span class="tag-index-symbol" aria-hidden="true">${homeIcons.tags}</span><span class="tag-index-name">${escapeHTML(tag)}</span><span class="tag-index-count" aria-label="${count} 篇内容">${count}</span></a></li>`).join('')
 return `<section class="tag-mobile-distribution"><header class="tag-index-heading"><h2>标签分布</h2><span>TOP ${Math.min(10,stats.counts.length)}</span></header>${renderTagRanking(stats)}</section><section class="tag-catalog" aria-label="全部标签"><header class="tag-index-heading"><h2>全部标签</h2><span data-tag-visible-count>${stats.counts.length} 个</span></header><ul class="tag-catalog-list">${tags}</ul><p class="tag-index-empty" data-tag-empty-filter hidden>没有匹配的标签</p></section>`
}
