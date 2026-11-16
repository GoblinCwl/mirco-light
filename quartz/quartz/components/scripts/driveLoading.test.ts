import {test} from 'node:test'
import assert from 'node:assert/strict'
import {beginDriveLoading} from './driveLoading'

test('local preview keeps the shared loading indicator until preparation and rendering both finish',()=>{
 const indicator={hidden:true}
 const attributes=new Set<string>()
 const root={querySelector:()=>indicator,setAttribute:(name:string)=>attributes.add(name),toggleAttribute:(name:string,value:boolean)=>{if(value)attributes.add(name);else attributes.delete(name)}}
 const scope={closest:(selector:string)=>{assert.ok(selector.includes('[data-drive-loading-root]'));return root}} as unknown as HTMLElement
 const controller=new AbortController()
 const prepared=beginDriveLoading(scope,controller.signal),rendered=beginDriveLoading(scope,controller.signal)
 assert.equal(indicator.hidden,false)
 prepared();assert.equal(indicator.hidden,false)
 rendered();assert.equal(indicator.hidden,true);assert.equal(attributes.has('data-drive-loading'),false)
 const interrupted=beginDriveLoading(scope,controller.signal)
 controller.abort();assert.equal(indicator.hidden,true)
 interrupted();assert.equal(indicator.hidden,true)
})
