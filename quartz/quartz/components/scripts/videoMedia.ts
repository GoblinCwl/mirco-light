import { collectionVideos, videoHref, videoIcon, type VideoCollection, type VideoLibrary } from './videoLibrary'
import { repoEscape as e } from './repoShared'
import { paginateCatalog, catalogSortControl, catalogPagination } from './catalogControls'

const duration = (seconds:number) => `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`
const date = (value:string) => new Date(value).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'})
const seriesIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M5 4h14M7 1h10m-7 11 5 3-5 3Z"/></svg>'
const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9 5 11 7-11 7Z"/></svg>'
type Card={title:string;href:string;cover:string;unavailable:boolean;other:boolean;badge:string;date:string;meta:string;extra:string}
export type VideoCatalogSort='newest'|'oldest'|'name'
export function videoCatalogHref(collection:string, order:VideoCatalogSort, page=1) {
  const url=new URL(videoHref('',collection),'https://video.invalid')
  if(order!=='newest')url.searchParams.set('sort',order)
  if(page>1)url.searchParams.set('page',String(page))
  return url.pathname+url.search
}
function sorted(cards:Card[],order:VideoCatalogSort) {
  return cards.sort((a,b)=>{
    const other=Number(a.other)-Number(b.other)
    if(other)return other
    if(order!=='name') {
      if(!a.date!==!b.date)return a.date?-1:1
      const difference=a.date.localeCompare(b.date)*(order==='newest'?-1:1)
      if(difference)return difference
    }
    return a.title.localeCompare(b.title,'zh-CN',{numeric:true})
  })
}
function grid(cards:Card[],label:string) {
  return `<div class="video-media-grid" aria-label="${e(label)}">${cards.map(card=>`<article class="video-media-card${card.unavailable?' is-unavailable':''}"><a class="video-media-poster${card.cover?' is-media-loading':''}" href="${e(card.href)}" data-no-popover="true" aria-label="${e(card.title)}"${card.cover?' aria-busy="true"':''}><span class="video-media-fallback">${videoIcon}</span>${card.cover?`<img src="${e(card.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" no-view />`:''}${!card.unavailable?`<span class="video-media-play">${playIcon}</span>`:''}<span class="video-media-badge">${e(card.badge)}</span></a><div class="video-media-caption"><a class="video-media-title" href="${e(card.href)}" title="${e(card.title)}" data-no-popover="true">${e(card.title)}</a><div class="video-media-detail"><span>${e(card.meta)}</span>${card.extra?`<span>${e(card.extra)}</span>`:''}</div></div></article>`).join('')}</div>`
}
export function videoMediaListing(library:VideoLibrary, collection?:VideoCollection, order:VideoCatalogSort='newest', requested=1) {
  const videos=collection?collectionVideos(library,collection):library.videos
  const cards:Card[]=videos.map(video=>({title:video.title,href:videoHref(video.bvid,collection?.id),cover:video.cover,unavailable:video.availability==='unavailable',other:false,badge:video.availability==='unavailable'?'已失效':duration(video.duration),date:video.publishedAt||'',meta:video.publishedAt?date(video.publishedAt):'',extra:video.availability==='unavailable'?'暂不可播放':`${video.play.toLocaleString('zh-CN')} 播放`}))
  const page=paginateCatalog(sorted(cards,order),requested)
  const categories=[{id:'',title:'全部',count:library.videos.length},...library.collections.map(group=>({id:group.id,title:group.title,count:collectionVideos(library,group).length}))]
  return `<section class="catalog-category-section"><nav class="catalog-category-nav" aria-label="视频系列">${categories.map(group=>`<a href="${e(videoCatalogHref(group.id,order))}" data-no-popover="true"${(collection?.id||'')===group.id?' aria-current="page"':''}>${seriesIcon}<span>${e(group.title)}</span><small>${group.count}</small></a>`).join('')}</nav></section><section data-video-all><div class="catalog-toolbar">${collection?`<span>共 ${videos.length} 个视频</span>`:`<div class="catalog-list-title"><h2>全部视频</h2><span>共 ${videos.length} 个视频</span></div>`}${catalogSortControl('data-video-media-sort','视频排序',[['newest','最新发布'],['oldest','最早发布'],['name','名称']],order)}</div>${grid(page.items,'视频列表')}${videos.length?'':`<div class="video-empty">${videoIcon}<p>暂无公开视频</p></div>`}${catalogPagination(page.page,page.pages,value=>videoCatalogHref(collection?.id||'',order,value))}</section>`
}
export function setupVideoMediaImages(root:HTMLElement,signal:AbortSignal) {
  for(const image of root.querySelectorAll<HTMLImageElement>('.video-media-poster > img')) {
    const link=image.parentElement!
    const finish=()=>{link.classList.remove('is-media-loading');link.setAttribute('aria-busy','false')}
    const ready=async()=>{try{await image.decode()}catch{}if(signal.aborted)return;image.classList.add('is-ready');finish()}
    image.addEventListener('load',()=>void ready(),{once:true,signal})
    image.addEventListener('error',()=>{image.remove();finish()},{once:true,signal})
    if(image.complete){if(image.naturalWidth)void ready();else{image.remove();finish()}}
  }
}
