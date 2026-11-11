import type {ContentCatalog} from './contentCatalog'

export type RepoDirectory = {repositories:{name:string;language:string}[]}
export function indexedRepoDirectory(catalog:ContentCatalog):RepoDirectory {
 const repositories=Object.values(catalog.pages).filter(page=>page.type==='repo').map(page=>({
  name:typeof page.extra.name==='string'?page.extra.name:page.title,
  language:typeof page.extra.language==='string'&&page.extra.language?page.extra.language:'其他',
 }))
 repositories.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}))
 return {repositories}
}
export type DirectoryVideo={bvid:string;title:string;publishedAt:string|null}
export type DirectorySeries={id:string;title:string;bvids:string[]}
export type VideoDirectory={videos:DirectoryVideo[];collections:DirectorySeries[]}
export function indexedVideoDirectory(catalog:ContentCatalog):VideoDirectory {
 const videos:DirectoryVideo[]=[],groups=new Map<string,DirectorySeries>()
 for(const page of Object.values(catalog.pages)){
  if(page.type!=='video')continue
  const bvid=typeof page.extra.bvid==='string'?page.extra.bvid:page.slug.split('/')[1]
  if(!/^BV[0-9A-Za-z]{10}$/.test(bvid||''))continue
  videos.push({bvid,title:page.title,publishedAt:page.createdAt||null})
  let grouped=false
  for(const series of Array.isArray(page.extra.series)?page.extra.series:[]){
   if(typeof series?.id!=='string'||!series.id||series.id==='other'||typeof series.title!=='string'||!series.title)continue
   const group:DirectorySeries=groups.get(series.id)||{id:series.id,title:series.title,bvids:[]}
   if(!group.bvids.includes(bvid))group.bvids.push(bvid)
   groups.set(group.id,group);grouped=true
  }
  if(!grouped){const group:DirectorySeries=groups.get('other')||{id:'other',title:'其他',bvids:[]};group.bvids.push(bvid);groups.set('other',group)}
 }
 const time=(value:string|null)=>Date.parse(value||'')||0
 videos.sort((a,b)=>time(b.publishedAt)-time(a.publishedAt)||a.bvid.localeCompare(b.bvid))
 const times=new Map(videos.map(video=>[video.bvid,time(video.publishedAt)]))
 const latest=(group:DirectorySeries)=>group.bvids.reduce((value,id)=>Math.max(value,times.get(id)||0),0)
 const collections=[...groups.values()].sort((a,b)=>Number(a.id==='other')-Number(b.id==='other')||latest(b)-latest(a)||a.title.localeCompare(b.title,'zh-CN'))
 return {videos,collections}
}
export function seriesDirectoryVideos(directory:VideoDirectory,series:DirectorySeries){
 const members=new Set(series.bvids)
 return directory.videos.filter(video=>members.has(video.bvid))
}
