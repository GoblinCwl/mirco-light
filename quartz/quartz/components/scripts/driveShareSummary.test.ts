import {test} from 'node:test'
import assert from 'node:assert/strict'
test('share summary makes one current-level request, coalesces reads and reuses the response',async()=>{
  Object.assign(globalThis,{document:new EventTarget(),window:new EventTarget()})
  const original=globalThis.fetch;const requests:{path:string;page:number;per_page:number}[]=[]
  globalThis.fetch=async(_url,init)=>{requests.push(JSON.parse(String(init?.body)));return Response.json({code:200,data:{content:[{name:'folder',is_dir:true},{name:'file',is_dir:false}],total:2}})}
  try{
    const {readDriveShareRoot}=await import('./driveShareSummary')
    const signal=new AbortController().signal
    const [first,second]=await Promise.all([readDriveShareRoot('public',signal),readDriveShareRoot('public',signal)])
    assert.equal(first.directories,1);assert.equal(first.files,1);assert.equal(second.total,2)
    await readDriveShareRoot('public',signal)
    assert.equal(requests.length,1);assert.equal(requests[0].path,'/@s/public');assert.equal(requests[0].per_page,0)
  }finally{globalThis.fetch=original}
})
