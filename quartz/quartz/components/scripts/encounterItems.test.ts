import {test} from 'node:test'
import assert from 'node:assert/strict'
import {encounterItemsFromIndex,pickEncounterItems,type EncounterItem} from './encounterItems'
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
test('mixed batches do not reserve a video slot and avoid repeated entries',()=>{
 const articles=encounterItemsFromIndex(Array.from({length:5},(_,i)=>page('article',`a${i}`)),()=>false)
 const a=pickEncounterItems(articles,new Set(),()=>.5)
 assert.equal(a.length,3);assert.equal(new Set(a.map(item=>item.id)).size,3)
 const mixed=[...articles,...encounterItemsFromIndex([page('repo','repo'),page('video','BV1234567890'),page('share','share')],()=>false)] as EncounterItem[]
 const result=pickEncounterItems(mixed,new Set(),()=>.5)
 assert.equal(result.length,3);assert.equal(new Set(result.map(item=>item.kind)).size,3)
})

test('share encounter keeps the authoritative creation date rather than the update date',()=>{
 const sharedAt='2026-10-01T00:00:00Z',items=encounterItemsFromIndex([{...page('share','public'),createdAt:sharedAt}],()=>false)
 assert.equal(items[0].kind,'share');if(items[0].kind==='share')assert.equal(items[0].entry.sharedAt,sharedAt)
})
