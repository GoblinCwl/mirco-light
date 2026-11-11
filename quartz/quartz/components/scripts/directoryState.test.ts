import { test } from "node:test"
import assert from "node:assert/strict"

const instance = async (filename: string, name: string) => {
  const url = new URL(filename, import.meta.url); url.searchParams.set("instance", name)
  return import(url.href)
}
test("independently bundled directory modules share the active group", async context => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document")
  Object.defineProperty(globalThis, "document", { configurable: true, value: new EventTarget() })
  context.after(() => { if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document") })
  const first = await instance("./directoryGroups.ts", "first"), second = await instance("./directoryGroups.ts", "second")
  first.activateDirectoryGroup({ domain: "explore", root: "Repo" })
  assert.deepEqual(second.activeDirectoryGroup(), { domain: "explore", root: "Repo" })
  second.activateDirectoryGroup({ domain: "explore", root: "Video" })
  assert.deepEqual(first.activeDirectoryGroup(), { domain: "explore", root: "Video" })
  second.activateDirectoryGroup(undefined)
})
test("the SPA cleanup disposes registrations from separate directory bundles", async () => {
  const first = await instance("./directoryPersistence.ts", "first"), second = await instance("./directoryPersistence.ts", "second")
  const root = {}, scope = { closest: () => root }
  let disposed = 0
  first.addDirectoryCleanup(scope, () => disposed++)
  second.addDirectoryCleanup(scope, () => disposed++)
  second.disposeDirectory(root)
  assert.equal(disposed, 2)
  first.disposeDirectory(root)
  assert.equal(disposed, 2)
})

test("route disclosures settle immediately while explicit manual transitions stay enabled", async context => {
  const names = ["cancelAnimationFrame", "requestAnimationFrame"] as const
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name))
  const frames: FrameRequestCallback[] = []
  Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: () => {} })
  Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => frames.push(callback) })
  context.after(() => names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name) }))
  const {setRouteDirectoryOpen,consumeRouteDirectoryToggle} = await instance('./directoryPersistence.ts','motion')
  const details = {open:false,dataset:{}} as HTMLDetailsElement
  setRouteDirectoryOpen(details,true)
  assert.equal(details.open,true)
  assert.equal('routeUpdating' in details.dataset,true)
  assert.equal(consumeRouteDirectoryToggle(details),true)
  frames[0](0); frames[1](16)
  assert.equal('routeUpdating' in details.dataset,false)
  const scheduled = frames.length
  setRouteDirectoryOpen(details,false,true)
  assert.equal(details.open,false)
  assert.equal('routeUpdating' in details.dataset,false)
  assert.equal(frames.length,scheduled)
})

test("unchanged integration branches never measure layout or restart a manual animation", async context => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia')
  Object.defineProperty(globalThis, 'matchMedia', {configurable:true,value:()=>({matches:false})})
  context.after(()=>{if(previous)Object.defineProperty(globalThis,'matchMedia',previous);else Reflect.deleteProperty(globalThis,'matchMedia')})
  const {createDirectoryDetailsMotion}=await import('./directoryDetailsMotion')
  const controller=new AbortController(),setOpen=createDirectoryDetailsMotion(controller.signal)
  let measured=0,animated=0,cancelled=0
  const list={getBoundingClientRect:()=>{measured++;return {height:120}},get scrollHeight(){measured++;return 120},animate:()=>{animated++;return {finished:new Promise(()=>{}),cancel:()=>cancelled++}}}
  const details={open:true,dataset:{directoryExpanded:'true'},querySelector:(selector:string)=>selector===':scope > ul'?list:null} as unknown as HTMLDetailsElement
  for(let i=0;i<100;i++)setOpen(details,true)
  assert.equal(measured,0)
  setOpen(details,false,true)
  const firstMeasurement=measured
  for(let i=0;i<100;i++)setOpen(details,false)
  assert.equal(measured,firstMeasurement)
  assert.equal(animated,1)
  assert.equal(cancelled,0)
  controller.abort()
  assert.equal(cancelled,1)
})
