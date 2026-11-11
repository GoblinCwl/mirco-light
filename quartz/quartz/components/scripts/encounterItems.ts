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
export function pickEncounterItems(items:EncounterItem[],previous:Set<string>,random=Math.random) {
  const kinds=[...new Set(items.map(item=>item.kind))]
  const shuffle=<T>(values:T[])=>{for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]]}return values}
  const chosen:EncounterItem[]=[]
  // A mixed batch, without a mandatory video slot or one source drowning out the others.
  for(const kind of shuffle(kinds)){
    const all=items.filter(item=>item.kind===kind),fresh=all.filter(item=>!previous.has(item.id)),pool=fresh.length?fresh:all
    chosen.push(pool[Math.floor(random()*pool.length)])
    if(chosen.length===3)return chosen
  }
  const rest=items.filter(item=>!chosen.some(pick=>pick.id===item.id))
  rest.sort((a,b)=>Number(previous.has(a.id))-Number(previous.has(b.id)))
  while(chosen.length<3&&rest.length)chosen.push(rest.shift()!)
  return chosen
}
