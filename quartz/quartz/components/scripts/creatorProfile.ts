import { repoEscape as e } from "./repoShared"
import { homeIcons } from "../../home/icons"
type Metric={label:string;value:string;icon?:string;title?:string}
type Profile = { name:string; avatar?:string; href?:string; subtitle?:string; description?:string; platform?:'github'|'bilibili';level?:number|null;metrics?:readonly Metric[] }
export const creatorIcons={
  repository:'<path d="M4 3h14v18H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h14M7 7h7"/>',
  following:'<circle cx="10" cy="8" r="3"/><path d="M3 21v-2a7 7 0 0 1 12-5m1 4 2 2 4-5"/>',
  people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  play:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',

}
const svg=(path:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`
// Rasterize the local brand SVG as a CSS mask rather than placing an SVG
// document in the sticky sidebar's image-loading stacking context.
const platformMasks = Object.fromEntries(['github','bilibili'].map(platform => [platform,
  `url("data:image/svg+xml,${encodeURIComponent(homeIcons[platform].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}")`,
]))
export function creatorProfile(profile: Profile) {
  const external=' target="_blank" rel="noopener noreferrer" data-router-ignore="true"'
  const name=profile.href?`<a href="${e(profile.href)}"${/^https?:/.test(profile.href)?external:''} data-no-popover="true">${e(profile.name)}</a>`:`<strong>${e(profile.name)}</strong>`
  const value=profile.level
  const colors=['#a9a9a9','#a9a9a9','#80cfa5','#75bfd3','#ffac78','#ff7b29','#f04452']
  const digits=['M17 3h4v6h-4Z','M19 3v6','M17 3h4v3h-4v3h4','M17 3h4v6h-4m0-3h4','M17 3v3h4m0-3v6','M21 3h-4v3h4v3h-4','M21 3h-4v6h4V6h-4']
  const level=profile.platform==='bilibili'&&typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=6?`<svg class="creator-level" viewBox="0 0 24 12" role="img" aria-label="哔哩哔哩等级 ${value}"><title>哔哩哔哩等级 ${value}</title><path fill="${colors[value]}" d="M0 2h13l2-2h9v12H0Z"/><path fill="#fff" d="M2 3h1.4v4.8H6V9H2Zm5 0h1.5l1.7 4.7L11.9 3h1.5l-2.5 6H9.5Z"/><path d="${digits[value]}" fill="none" stroke="#fff" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>`:''
  const portrait=profile.avatar?`<img class="creator-avatar" src="${e(profile.avatar)}" width="80" height="80" alt="" referrerpolicy="no-referrer" no-view />`:'<span class="creator-avatar creator-initial" aria-hidden="true">'+e(Array.from(profile.name)[0]||'G')+'</span>'
  const badge=profile.platform?`<span class="creator-platform" role="img" aria-label="${profile.platform==='github'?'GitHub':'哔哩哔哩'}" style="${e('--creator-platform-mask:'+platformMasks[profile.platform])}"></span>`:''
  return `<section class="creator-profile${profile.platform?' creator-profile-'+profile.platform:''}" aria-label="作者信息"><div class="creator-identity"><div class="creator-portrait${profile.avatar?' image-container':''}">${portrait}${badge}</div><div class="creator-name"><div class="creator-name-line">${name}${level}</div>${profile.subtitle?`<span>${e(profile.subtitle)}</span>`:""}</div></div>${profile.description?`<p class="creator-bio">${e(profile.description)}</p>`:''}${profile.metrics?.length?`<div class="creator-metrics" aria-label="作者统计">${profile.metrics.map(metric=>`<div class="creator-metric"${metric.title?` title="${e(metric.title)}"`:''}><strong>${e(metric.value)}</strong><span>${metric.icon?svg(metric.icon):''}${e(metric.label)}</span></div>`).join("")}</div>`:''}</section>`
}
