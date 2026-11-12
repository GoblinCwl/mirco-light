import {i18n} from '../i18n'
import type {GlobalConfiguration} from '../cfg'
import errorNoticeStyle from './styles/errorNotice.scss'

export {errorNoticeStyle}
export type ErrorCode=403|404
export function errorNoticeContent(code:ErrorCode,locale:GlobalConfiguration['locale']) {
 const title=code===403?'光锥之外':'迷失星海'
 const copy=code===403?'403 · 星海无垠，所见终有边界。':i18n(locale).pages.error.notFound
 return {title,description:copy.replace(/^(403|404)\s*·\s*/,'').replace(/[。.]$/,'')}
}
export function ErrorNotice({code,title,description}:{code:ErrorCode;title:string;description:string}) {
 return <div class={`error-notice error-notice--${code}`}>
  <div class="error-notice-icon" aria-hidden="true">
   {code===403?<svg viewBox="0 0 64 64" fill="none">
    <path class="error-notice-barrier" d="M39 8c10 5 16 13 16 24s-6 19-16 24M34 13c9 5 14 11 14 19s-5 14-14 19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M25 32h20" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2 4" opacity=".28"/>
    <path class="error-notice-impact" d="M46 24q5 8 0 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle class="error-notice-blocked-point" cx="27" cy="32" r="2.2" fill="currentColor"/>
    <path class="error-notice-star" d="m16 23 2.1 6.9L25 32l-6.9 2.1L16 41l-2.1-6.9L7 32l6.9-2.1Z" fill="currentColor"/>
   </svg>:<svg viewBox="0 0 64 64" fill="none">
    <path class="error-notice-orbit" d="M33 12a20 20 0 1 0 19 26" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M19 43C30 41 38 32 49 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2 4" opacity=".28"/>
    <circle class="error-notice-point" cx="19" cy="43" r="2.4" fill="currentColor"/>
    <g opacity=".4"><circle class="error-notice-point error-notice-point-secondary" cx="19" cy="43" r="1.4" fill="currentColor"/></g>
    <path class="error-notice-star" d="m49 5 2.1 6.9L58 14l-6.9 2.1L49 23l-2.1-6.9L40 14l6.9-2.1Z" fill="currentColor"/>
   </svg>}
  </div>
  <div class="error-notice-copy">
   <h1 class="error-notice-title" id="error-notice-title"><span class="error-notice-code">{code}</span><span class="error-notice-name">{title}</span></h1>
   <p class="error-notice-description">{description}</p>
  </div>
 </div>
}
