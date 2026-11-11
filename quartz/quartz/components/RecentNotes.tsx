// @ts-ignore
import script from "./scripts/recentNotes.inline"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { SimpleSlug, resolveRelative } from "../util/path"
import style from "./styles/recentNotes.scss"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"
interface Options { title?:string;limit:number;linkToMore:SimpleSlug|false;showTags:boolean }
export default ((userOpts?:Partial<Options>)=>{
 const RecentNotes:QuartzComponent=({fileData,displayClass,cfg}:QuartzComponentProps)=>{
  const opts:Options={limit:3,linkToMore:false,showTags:true,...userOpts}
  return <div class={classNames(displayClass,"recent-notes")} data-recent-content={opts.limit} data-recent-locale={cfg.locale} data-recent-tags={String(opts.showTags)} aria-busy="true">
   <h3>{opts.title??i18n(cfg.locale).components.recentNotes.title}</h3>
   <ul class="recent-ul" aria-label="正在读取流新">{Array.from({length:opts.limit},(_,index)=><li class="recent-li recent-skeleton" aria-hidden="true"><span class="recent-skeleton-title"><i style={`width:${[88,72,82][index%3]}%`}/></span><span class="recent-skeleton-date"><i/></span></li>)}</ul>
   {opts.linkToMore&&<p data-recent-more hidden><a class="internal" href={resolveRelative(fileData.slug!,opts.linkToMore)}>查看更多</a></p>}
  </div>
 }
 RecentNotes.afterDOMLoaded=script;RecentNotes.css=style;return RecentNotes
}) satisfies QuartzComponentConstructor
