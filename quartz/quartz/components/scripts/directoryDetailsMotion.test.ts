import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createDirectoryDetailsMotion} from './directoryDetailsMotion'

function fixture(){
 const motions:{frames:Keyframe[];finish:()=>void;cancelled:boolean}[]=[]
 const list={scrollHeight:240,getBoundingClientRect:()=>({height:120}),animate:(frames:Keyframe[])=>{
  let finish!:()=>void,reject!:(reason:Error)=>void
  const finished=new Promise<void>((resolve,fail)=>{finish=resolve;reject=fail})
  const record={frames,finish,cancelled:false};motions.push(record)
  return {finished,cancel:()=>{record.cancelled=true;reject(Error('cancelled'))}}
 }}
 const details={open:true,dataset:{} as Record<string,string>,querySelector:(selector:string)=>selector===':scope > .directory-root-list'?list:{setAttribute:()=>{}}}
 return {details:details as unknown as HTMLDetailsElement,motions}
}

test('mobile content remains open while closing, then closes only after the height animation',async()=>{
 const previous=globalThis.matchMedia
 globalThis.matchMedia=(()=>({matches:false})) as unknown as typeof matchMedia
 try{
  const {details,motions}=fixture(),lifecycle=new AbortController(),toggle=createDirectoryDetailsMotion(lifecycle.signal,':scope > .directory-root-list')
  toggle(details,undefined,true)
  assert.equal(details.open,true)
  assert.equal(motions[0].frames.at(-1)?.height,'0px')
  assert.equal(details.dataset.directoryExpanded,'false')
  motions[0].finish();await Promise.resolve()
  assert.equal(details.open,false)
  lifecycle.abort()
 }finally{globalThis.matchMedia=previous}
})

test('a second tap reverses an unfinished mobile collapse without snapping shut',async()=>{
 const previous=globalThis.matchMedia
 globalThis.matchMedia=(()=>({matches:false})) as unknown as typeof matchMedia
 try{
  const {details,motions}=fixture(),lifecycle=new AbortController(),toggle=createDirectoryDetailsMotion(lifecycle.signal,':scope > .directory-root-list')
  toggle(details,undefined,true);toggle(details,undefined,true)
  assert.equal(motions[0].cancelled,true)
  assert.equal(motions[1].frames.at(-1)?.height,'240px')
  assert.equal(details.open,true)
  motions[1].finish();await Promise.resolve()
  assert.equal(details.open,true)
  lifecycle.abort()
 }finally{globalThis.matchMedia=previous}
})
