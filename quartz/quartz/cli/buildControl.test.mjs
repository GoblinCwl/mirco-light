import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {request} from 'node:http'
import {startBuildControl} from './buildControl.mjs'
test('local reload serializes requests, persists valid rules and reports success/failure',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'quartz-build-')),filename=join(directory,'content-policy.json')
 let finish,fail=false,count=0
 const server=await startBuildControl(async()=>{count++;await new Promise(resolve=>finish=resolve);if(fail)throw new Error('fixture failure')},{directory,filename})
 const call=(method,path,value)=>new Promise((resolve,reject)=>{const req=request({socketPath:join(directory,'quartz-build.sock'),method,path},res=>{let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({code:res.statusCode,...JSON.parse(text)}))});req.on('error',reject);req.end(value===undefined?'':JSON.stringify(value))})
 try{
  assert.equal((await call('GET','/status')).phase,'idle')
  assert.equal((await call('POST','/reload',{ignorePatterns:'../**',unlistedPatterns:''})).code,400)
  const rules={ignorePatterns:'Resources/**',unlistedPatterns:'Work/**'}
  assert.equal((await call('POST','/reload',rules)).code,202)
  assert.equal((await call('GET','/status')).phase,'running')
  assert.equal(JSON.parse(await readFile(join(directory,'build-status.json'),'utf8')).phase,'running')
  assert.equal((await call('POST','/reload',rules)).code,409)
  assert.deepEqual(JSON.parse(await readFile(filename,'utf8')),rules)
  finish();await new Promise(resolve=>setImmediate(resolve))
  assert.equal((await call('GET','/status')).phase,'success')
  fail=true;assert.equal((await call('POST','/reload',rules)).code,202);finish();await new Promise(resolve=>setImmediate(resolve))
  assert.equal((await call('GET','/status')).phase,'error');assert.equal(count,2)
 }finally{finish?.();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true})}
})
