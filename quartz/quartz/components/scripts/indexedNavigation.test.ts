import {test} from 'node:test'
import assert from 'node:assert/strict'
import {indexedRepoDirectory,indexedVideoDirectory,seriesDirectoryVideos} from './indexedNavigation'
import type {ContentCatalog,IndexedContent} from './contentCatalog'
const page=(type:IndexedContent['type'],slug:string,title:string,extra:Record<string,unknown>,createdAt='2026-01-01T00:00:00Z')=>({type,slug,title,extra,createdAt,tags:['人工标签']} as unknown as IndexedContent)
const catalog=(...pages:IndexedContent[]):ContentCatalog=>({revision:'r',pages:Object.fromEntries(pages.map(page=>[page.slug,page]))})
test('repo navigation uses source language independently of manually edited tags',()=>{
 const value=indexedRepoDirectory(catalog(page('repo','Repo/z','z',{name:'z',language:'Python'}),page('repo','Repo/a','a',{language:''}),page('article','Memo/a','article',{})))
 assert.deepEqual(value.repositories,[{name:'a',language:'其他'},{name:'z',language:'Python'}])
})
test('video navigation uses stable series IDs, newest publication order and other last',()=>{
 const a=page('video','Video/BV1ua4W6XEJd','older',{bvid:'BV1ua4W6XEJd',series:[{id:'series:2',title:'系列'}]})
 const b=page('video','Video/BV16qpjewEqx','newer',{bvid:'BV16qpjewEqx',series:[{id:'series:2',title:'系列'}]},'2026-02-01T00:00:00Z')
 const c=page('video','Video/BV1234y1275S','other',{bvid:'BV1234y1275S',series:[]},'2026-03-01T00:00:00Z')
 const tree=indexedVideoDirectory(catalog(a,b,c))
 assert.deepEqual(tree.collections.map(group=>group.id),['series:2','other'])
 assert.deepEqual(seriesDirectoryVideos(tree,tree.collections[0]).map(video=>video.title),['newer','older'])
 assert.deepEqual(tree.collections[1].bvids,['BV1234y1275S'])
 assert.equal(tree.collections.some(group=>group.title==='人工标签'),false)
})
test('multiple series membership is retained and duplicate membership is removed',()=>{
 const item=page('video','Video/BV1ua4W6XEJd','video',{series:[{id:'one',title:'一'},{id:'one',title:'一'},{id:'two',title:'二'}]})
 const tree=indexedVideoDirectory(catalog(item,page('share','Share/x','share',{})))
 assert.equal(tree.videos.length,1);assert.equal(tree.collections.length,2)
 for(const group of tree.collections)assert.deepEqual(group.bvids,['BV1ua4W6XEJd'])
})
