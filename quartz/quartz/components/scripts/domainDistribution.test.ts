import {test} from 'node:test'
import assert from 'node:assert/strict'
import {domainDistribution} from './domainDistribution'
import type {ContentCatalog} from './contentCatalog'

test('domain distribution counts all four indexed content types instead of markdown paths',()=>{
 const catalog={revision:'one',pages:{
  'Memo/a':{type:'article'},'Memo/b':{type:'article'},'Memoir/c':{type:'article'},
  'Private/a':{type:'article'},'Study/a':{type:'article'},
  'Share/分享/movie':{type:'share'},'Share/分享/collection':{type:'share'},
  'Repo/project':{type:'repo'},'Repo/guide':{type:'article'},
  'Video/BV1':{type:'video'},'Video/BV2':{type:'video'},
 }} as unknown as ContentCatalog
 assert.deepEqual(domainDistribution(catalog,'Memo'),{count:2,unit:'篇文章'})
 assert.equal(domainDistribution(catalog,'Private').count,1)
 assert.equal(domainDistribution(catalog,'Study').count,1)
 assert.deepEqual(domainDistribution(catalog,'Share'),{count:2,unit:'个分享'})
 assert.deepEqual(domainDistribution(catalog,'Repo'),{count:1,unit:'个仓库'})
 assert.deepEqual(domainDistribution(catalog,'Video'),{count:2,unit:'个视频'})
 delete catalog.pages['Video/BV2']
 assert.equal(domainDistribution(catalog,'Video').count,1,'new catalog state replaces the old count')
})
