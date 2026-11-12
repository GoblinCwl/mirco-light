import type {QuartzComponent,QuartzComponentConstructor} from '../types'
import {ErrorNotice,errorNoticeContent,errorNoticeStyle} from '../ErrorNotice'
import style from '../styles/siteNotFound.scss'

const SiteNotFound:QuartzComponent=({cfg})=> <article class="site-not-found" aria-labelledby="error-notice-title">
 <ErrorNotice code={404} {...errorNoticeContent(404,cfg.locale)}/>
</article>
SiteNotFound.css=[errorNoticeStyle,style]
export default (()=>SiteNotFound) satisfies QuartzComponentConstructor
