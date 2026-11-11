import {contentTypeIcons} from "../util/contentTypeIcons"
import {QuartzComponent,QuartzComponentConstructor} from './types'
const TagIndexSidebar:QuartzComponent=({fileData})=>{
 if(!fileData.slug?.startsWith('tags/'))return null
 return <aside class="tag-index-aside" data-tag-sidebar hidden={fileData.slug!=='tags/index'} aria-busy="true">
   <section><h3>标签分布 <span>TOP 10</span></h3><div data-tag-ranking><span class="tag-ranking-pending">正在读取标签分布…</span></div></section>
   <section class="tag-index-sources"><h3>内容来源</h3><dl>{(['article','share','repo','video'] as const).map((kind,index)=>{const label=['文章','分享','仓库','视频'][index];return <div title={label}><dt><span aria-hidden="true" dangerouslySetInnerHTML={{__html:contentTypeIcons[kind]}}/>{label}</dt><dd data-tag-source-count={index}>—</dd></div>})}</dl></section>
 </aside>
}
export default (()=>TagIndexSidebar) satisfies QuartzComponentConstructor
