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
