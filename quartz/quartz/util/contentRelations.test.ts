import {test} from 'node:test'
import assert from 'node:assert/strict'
import {contentBacklinks,currentContent} from './contentRelations'
import type {ContentCatalog,IndexedContent} from '../components/scripts/contentCatalog'
const page=(slug:string,type:IndexedContent['type'],links:string[]=[])=>({slug,type,title:slug,href:'/'+slug.replace(/\/index$/,''),links} as IndexedContent)
const catalog:ContentCatalog={revision:'1',pages:Object.fromEntries([
 page('Memo/note/index','article'),page('Memo/source','article',['Memo/note','Repo/code']),page('Repo/code','repo',['Memo/note/index']),page('Video/BV1','video',['Memo/note']),page('Share/分享/example','share',['Memo/note','Memo/note/index']),page('Memo/self','article',['Memo/self'])
].map(p=>[p.slug,p]))}
test('all four types produce deduplicated backlinks using simplified identities',()=>{
 const links=contentBacklinks(catalog,'Memo/note/index')
 assert.equal(links.length,4);assert.deepEqual(new Set(links.map(p=>p.type)),new Set(['article','repo','video','share']))
 assert.equal(contentBacklinks(catalog,'Memo/self').length,0)
 assert.deepEqual(contentBacklinks(catalog,'Repo/code').map(p=>p.slug),['Memo/source'])
})
test('project detail identity ignores query, fragment and Share internal paths',()=>{
 assert.equal(currentContent(catalog,'https://site.test/Repo/code/?ref=main#readme','Repo/index')?.slug,'Repo/code')
 assert.equal(currentContent(catalog,'https://site.test/Video/BV1/?page=2','Video/index')?.slug,'Video/BV1')
 assert.equal(currentContent(catalog,'https://site.test/Share/%E5%88%86%E4%BA%AB/example/folder/a.pdf','Share/index')?.slug,'Share/分享/example')
 assert.equal(currentContent(catalog,'https://site.test/Share/分享/example-other','Share/index'),undefined)
 assert.equal(currentContent(catalog,'https://site.test/Repo/','Repo/index'),undefined)
 assert.equal(currentContent(catalog,'https://site.test/alias','Memo/note/index')?.slug,'Memo/note/index')
})
