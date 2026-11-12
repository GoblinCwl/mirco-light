import {homeIcons} from '../home/icons'
import {QuartzComponent,QuartzComponentConstructor} from './types'
const TagIndexSidebar:QuartzComponent=({fileData})=>{
 if(!fileData.slug?.startsWith('tags/'))return null
 return <>
  <button type="button" class="tag-panel-launch" data-tag-panel-open aria-label="全部标签" aria-haspopup="dialog" aria-controls="tag-navigation-panel" aria-expanded="false" dangerouslySetInnerHTML={{__html:homeIcons.tags+'<span>全部标签</span>'}} />
  <aside class="tag-index-aside" data-tag-sidebar aria-busy="true">
   <dialog id="tag-navigation-panel" class="tag-navigation-panel" data-tag-panel open tabIndex={-1} aria-labelledby="tag-panel-title">
    <header class="tag-panel-heading"><h3 id="tag-panel-title">全部标签</h3><button type="button" class="tag-panel-close" data-tag-panel-close aria-label="关闭全部标签"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <label class="tag-navigation-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" data-tag-navigation-search placeholder="搜索标签" aria-label="搜索标签" autoComplete="off" spellcheck={false}/></label>
    <div data-tag-navigation><div class="tag-navigation-loading" role="status" aria-label="正在读取标签"><span class="tag-navigation-spinner" aria-hidden="true"><i/></span><span class="tag-navigation-skeleton" aria-hidden="true"><i/><i/><i/><i/><i/><i/></span></div></div><p class="tag-navigation-empty" data-tag-navigation-empty role="status" hidden>未找到标签</p>
   </dialog>
  </aside>
 </>
}
export default (()=>TagIndexSidebar) satisfies QuartzComponentConstructor
