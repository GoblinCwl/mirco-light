import {test} from 'node:test'
import assert from 'node:assert/strict'
import {encounterItemsFromIndex,pickEncounterItems,encounterWeights,type EncounterItem} from './encounterItems'
import type {IndexedContent} from './contentCatalog'
const page=(type:IndexedContent['type'],id:string,extra:Record<string,unknown>={}):IndexedContent=>({id:`${type}:${id}`,type,slug:(type==='share'?`Share/分享/${id}`:type==='video'?`Video/${id}`:`Memo/${id}`) as IndexedContent['slug'],filePath:id as IndexedContent['filePath'],href:'/'+id,title:id,description:'Example description',content:'',tags:['标签'],links:[],encrypted:false,updatedAt:'2026-11-09T00:00:00Z',extra})
test('unified catalog supplies every type and protects encrypted articles/shares before sampling',()=>{
 const pages=[page('article','article'),{...page('article','private'),encrypted:true},page('share','public'),{...page('share','locked'),encrypted:true},{...page('share','unlocked',{jellyfin:true}),encrypted:true},page('repo','repo',{name:'repo',language:'Python'}),page('video','BV1234567890',{duration:120,play:42})]
 const items=encounterItemsFromIndex(pages,id=>id==='unlocked')
 assert.deepEqual(items.map(item=>item.id),['article:article','share:public','share:unlocked','repo:repo','video:BV1234567890'])
 const video=items.find(item=>item.kind==='video')!;assert.equal(video.video.play,42);assert.equal(video.video.duration,120)
 const repo=items.find(item=>item.kind==='repo')!;assert.equal(repo.repo.language,'Python');assert.equal(repo.repo.pushed_at,pages[0].updatedAt)
 assert.equal(encounterItemsFromIndex(pages,()=>false).some(item=>item.id==='share:unlocked'),false)
})
test('sampling has no type quotas and avoids repeated entries',()=>{
 const articles=encounterItemsFromIndex(Array.from({length:5},(_,i)=>page('article',`a${i}`)),()=>false)
 const a=pickEncounterItems(articles,new Set(),()=>.5)
 assert.equal(a.length,3);assert.equal(new Set(a.map(item=>item.id)).size,3)
 const mixed=[...articles,...encounterItemsFromIndex([page('repo','repo'),page('video','BV1234567890'),page('share','share')],()=>false)] as EncounterItem[]
 const result=pickEncounterItems(mixed,new Set(),()=>.5)
 assert.equal(result.length,3);assert.equal(new Set(result.map(item=>item.id)).size,3)
 const sameType=pickEncounterItems(mixed,new Set(),()=>0)
 assert.deepEqual(sameType.map(item=>item.kind),['article','article','article'])
 const fresh=pickEncounterItems(mixed,new Set(a.map(item=>item.id)),()=>.5)
 assert.ok(fresh.every(item=>!a.some(old=>old.id===item.id)))
 assert.deepEqual(pickEncounterItems([],new Set()),[])
})

test('share encounter keeps the authoritative creation date rather than the update date',()=>{
 const sharedAt='2026-10-01T00:00:00Z',items=encounterItemsFromIndex([{...page('share','public'),createdAt:sharedAt}],()=>false)
 assert.equal(items[0].kind,'share');if(items[0].kind==='share')assert.equal(items[0].entry.sharedAt,sharedAt)
})

test('weights can exclude types entirely without imposing a minimum slot for other types',()=>{
 const items=encounterItemsFromIndex([...Array.from({length:5},(_,i)=>page('article',`a${i}`)),page('repo','r'),page('share','s')],()=>false)
 const weights={article:2,repo:0,share:0,video:0}
 const batch=pickEncounterItems(items,new Set(),()=>.7,weights)
 assert.equal(batch.length,3);assert.ok(batch.every(item=>item.kind==='article'))
 assert.deepEqual(pickEncounterItems(items,new Set(),()=>0,{article:0,repo:0,share:0,video:0}),[])
 assert.deepEqual(encounterWeights({'home.encounter.articleWeight':0,'home.encounter.videoWeight':5}),{article:0,share:1,repo:1,video:5})
})

test('relative type weights determine frequency independently of how many records each type has',()=>{
 const items=encounterItemsFromIndex([...Array.from({length:30},(_,i)=>page('article',`a${i}`)),...Array.from({length:3},(_,i)=>page('repo',`r${i}`))],()=>false)
 let seed=12345,articles=0
 const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)
 for(let i=0;i<4000;i++)if(pickEncounterItems(items,new Set(),random,{article:4,repo:1,share:0,video:0})[0].kind==='article')articles++
 assert.ok(articles>3000&&articles<3400,`expected roughly 80% articles; got ${articles}/4000`)
})

test('refresh excludes the visible batch before choosing types, including high-weight singleton types',()=>{
 const items=encounterItemsFromIndex([...Array.from({length:4},(_,i)=>page('article',`a${i}`)),page('repo','r'),page('video','BV1234567890')],()=>false)
 const previous=new Set(['article:a0','repo:r','video:BV1234567890'])
 const selected=pickEncounterItems(items,previous,()=>.99,{article:1,video:100,repo:100,share:0})
 assert.equal(selected.length,3)
 assert.ok(selected.every(item=>!previous.has(item.id)))
})

test('refresh exhausts fresh items before filling missing slots from the visible batch',()=>{
 const items=encounterItemsFromIndex([page('article','a'),page('article','b'),page('repo','r'),page('video','BV1234567890')],()=>false)
 const previous=new Set(['article:a','repo:r','video:BV1234567890'])
 const selected=pickEncounterItems(items,previous,()=>.99,{article:1,video:100,repo:100,share:0})
 assert.equal(selected[0].id,'article:b')
 assert.equal(selected.length,3)
 assert.equal(new Set(selected.map(item=>item.id)).size,3)
})
