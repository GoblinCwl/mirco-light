import {test} from 'node:test'
import assert from 'node:assert/strict'
test('repositories without a usable README do not create a hover panel',async()=>{
  Object.assign(globalThis,{window:{}})
  const original=globalThis.fetch
  globalThis.fetch=async()=>Response.json({path:'',content:'',sha:'a'})
  try{
    const {repoHoverContent}=await import('./repoHover')
    assert.equal(await repoHoverContent(new URL('https://site.invalid/Repo/no-readme/'),'empty',new AbortController().signal),null)
  }finally{globalThis.fetch=original}
})
test('file previews preserve path and ref and never fall back to the README',async()=>{
  Object.assign(globalThis,{window:{}})
  const original=globalThis.fetch,requests:string[]=[]
  globalThis.fetch=async input=>{
    const url=new URL(String(input),'https://site.invalid');requests.push(url.pathname)
    assert.equal(url.searchParams.get('ref'),'feature/test')
    assert.equal(url.searchParams.get('path'),'src/example.sql')
    return Response.json({type:'directory',entries:[]})
  }
  try{
    const {repoHoverAvailable,repoHoverContent}=await import('./repoHover')
    const url=new URL('https://site.invalid/Repo/path-preview/?path=src%2Fexample.sql&ref=feature%2Ftest')
    assert.equal(repoHoverAvailable(url),true)
    assert.equal(await repoHoverContent(url,'file',new AbortController().signal),null)
    assert.deepEqual(requests,['/api/repo/path-preview/browse'])
  }finally{globalThis.fetch=original}
})
test('binary files do not create a code preview',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async()=>Response.json({type:'file',path:'archive.zip',content:'binary',binary:true})
  try{
    const {repoHoverContent}=await import('./repoHover')
    assert.equal(await repoHoverContent(new URL('https://site.invalid/Repo/binary-preview/?path=archive.zip'),'file',new AbortController().signal),null)
  }finally{globalThis.fetch=original}
})
