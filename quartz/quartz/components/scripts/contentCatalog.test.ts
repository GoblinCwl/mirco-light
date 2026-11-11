import {test} from 'node:test'
import assert from 'node:assert/strict'
import {articleIndex,readArticleIndex,readContentCatalog,type ContentCatalog,type IndexedContent} from './contentCatalog'
import {FileTrieNode} from '../../util/fileTrie'
import type {FullSlug} from '../../util/path'

const catalog:ContentCatalog={revision:'r1',pages:{
 'Study/HTTP-Client/note':{type:'article',slug:'Study/HTTP-Client/note',filePath:'Study/HTTP Client/note.md',title:'笔记',tags:['学习'],links:[],content:'',encrypted:true,extra:{filePath:'Study/HTTP Client/note.md'}} as unknown as IndexedContent,
 'Repo/project':{type:'repo',title:'项目',tags:[],extra:{}} as unknown as IndexedContent,
 'Share/project':{type:'share',title:'分享',tags:[],extra:{}} as unknown as IndexedContent,
 'Video/BVtest':{type:'video',title:'视频',tags:[],extra:{}} as unknown as IndexedContent,
}}
test('article projection keeps original folder names and excludes independent integration branches',()=>{
 const index=articleIndex(catalog)
 assert.deepEqual(Object.keys(index),['Study/HTTP-Client/note'])
 const tree=FileTrieNode.fromEntries(Object.entries(index) as [FullSlug,IndexedContent][])
 assert.equal(tree.findNode(['Study','HTTP-Client'])?.displayName,'HTTP Client')
 assert.equal(index['Study/HTTP-Client/note' as FullSlug].encrypted,true)
 assert.equal(catalog.pages['Repo/project'].title,'项目')
})
test('directory and full catalog consumers coalesce into the same API request',async()=>{
 const previous=globalThis.fetch;let count=0
 globalThis.fetch=(async(input)=>{assert.equal(input,'/api/site/content');count++;return new Response(JSON.stringify(catalog),{status:200})}) as typeof fetch
 try{
  const [index,all]=await Promise.all([readArticleIndex(),readContentCatalog()])
  assert.equal(count,1);assert.equal(Object.keys(index).length,1);assert.equal(Object.keys(all.pages).length,4)
 }finally{globalThis.fetch=previous}
})
test('a failed refresh does not poison later unified index reads',async()=>{
 const previous=globalThis.fetch;let count=0
 globalThis.fetch=(async()=>{count++;return count===1?new Response('',{status:503}):new Response(JSON.stringify(catalog),{status:200})}) as typeof fetch
 try{
  await assert.rejects(readArticleIndex({refresh:true}))
  const index=await readArticleIndex({refresh:true});assert.equal(Object.keys(index).length,1);assert.equal(count,2)
 }finally{globalThis.fetch=previous}
})
