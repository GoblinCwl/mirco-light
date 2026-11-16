import type {IndexedContent} from './contentCatalog'
import type {FullSlug} from '../../util/path'
import type {RepoSummary} from './repoShared'
import type {VideoItem} from './videoLibrary'
import type {DriveEntry} from './driveEntries'
export type EncounterItem=
  |{kind:'article';id:string;slug:FullSlug;title:string;excerpt:string}
  |{kind:'share';id:string;entry:Extract<DriveEntry,{kind:'share'}>}
  |{kind:'repo';id:string;repo:Pick<RepoSummary,'name'|'description'|'language'|'pushed_at'>}
  |{kind:'video';id:string;video:Pick<VideoItem,'bvid'|'title'|'cover'|'description'|'duration'|'publishedAt'|'play'>}
export function encounterItemsFromIndex(pages:IndexedContent[],unlocked:(id:string)=>boolean):EncounterItem[]{
 const items:EncounterItem[]=[]
 for(const page of pages){
  if(page.type==='article'){
   if(page.encrypted||page.slug==='index'||!page.description?.trim())continue
   let excerpt=page.description.replace(/🔐[βγ]\s*[\s\S]*?🔐/gu,'[加密文本]').replace(/🔐[βγ][\s\S]*$/gu,'[加密文本]').replace(/\s+/g,' ').trim()
   if(excerpt.startsWith(page.title))excerpt=excerpt.slice(page.title.length).trim()
   items.push({kind:'article',id:page.id,slug:page.slug,title:page.title,excerpt:excerpt.slice(0,180)})
  }else if(page.type==='share'){
   const id=String(page.slug).split('/')[2]
   if(!id||page.encrypted&&!unlocked(id))continue
   items.push({kind:'share',id:page.id,entry:{kind:'share',id,title:page.title,protected:Boolean(page.encrypted),tags:page.tags,sharedAt:page.createdAt||undefined,jellyfin:page.extra.jellyfin===true}})
  }else if(page.type==='repo'){
   items.push({kind:'repo',id:page.id,repo:{name:page.extra.name||page.title,description:page.description,language:page.extra.language||null,pushed_at:page.updatedAt||null}})
  }else if(page.type==='video'){
   const bvid=page.extra.bvid||String(page.slug).split('/')[1]
   if(!/^BV[0-9A-Za-z]{10}$/.test(bvid))continue
   const number=(name:string)=>Number.isFinite(Number(page.extra[name]))?Math.max(0,Number(page.extra[name])):0
   items.push({kind:'video',id:page.id,video:{bvid,title:page.title,description:page.description,cover:page.extra.cover||'',duration:number('duration'),play:number('play'),publishedAt:page.createdAt||null}})
  }
 }
 return items
}
export type EncounterWeights = Record<EncounterItem['kind'],number>
export function encounterWeights(settings:Record<string,unknown>):EncounterWeights {
 const weight=(kind:EncounterItem['kind'])=>{
  const value=settings[`home.encounter.${kind}Weight`]
  return typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):1
 }
 return {article:weight('article'),share:weight('share'),repo:weight('repo'),video:weight('video')}
}
export function pickEncounterItems(items:EncounterItem[],previous:Set<string>,random=Math.random,weights:EncounterWeights={article:1,share:1,repo:1,video:1}) {
 const remaining=items.filter(item=>weights[item.kind]>0),chosen:EncounterItem[]=[]
 while(chosen.length<3&&remaining.length){
  // Exclude the whole visible batch before choosing a weighted type. Otherwise
  // a type with no fresh items can bring an old item back despite other options.
  const fresh=remaining.filter(item=>!previous.has(item.id))
  const pool=fresh.length?fresh:remaining
  const kinds=[...new Set(pool.map(item=>item.kind))]
  const total=kinds.reduce((sum,kind)=>sum+weights[kind],0)
  let cursor=random()*total,kind=kinds[kinds.length-1]
  for(const candidate of kinds){cursor-=weights[candidate];if(cursor<0){kind=candidate;break}}
  const candidates=pool.filter(item=>item.kind===kind)
  const selected=candidates[Math.floor(random()*candidates.length)]
  chosen.push(selected)
  for(let index=remaining.length-1;index>=0;index--)if(remaining[index].id===selected.id)remaining.splice(index,1)
 }
 return chosen
}
