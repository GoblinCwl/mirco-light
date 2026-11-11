import {test} from 'node:test'
import assert from 'node:assert/strict'
import {playerPanelBounds,mountPlayerPanels,setupPlayerPanelHost} from './playerPanels'

test('menu canvas extends above a short video without enlarging its media rectangle',()=>{
 assert.deepEqual(playerPanelBounds(300,180,420,8,true),{offset:256,height:420})
 assert.deepEqual(playerPanelBounds(300,600,420,60,true),{offset:0,height:420})
})
test('menu stays within the viewport near the top and clears its canvas when closed',()=>{
 assert.deepEqual(playerPanelBounds(40,180,420,8,true),{offset:32,height:196})
 assert.deepEqual(playerPanelBounds(300,180,420,8,false),{offset:0,height:164})
 assert.deepEqual(playerPanelBounds(-50,180,420,8,true),{offset:0,height:164})
})
test('ordinary player injection remains a self-contained function',()=>{
 const serialized=mountPlayerPanels.toString()
 const restored=new Function(`return (${serialized})`)()
 assert.equal(typeof restored,'function')
})

test('parent accepts only the matching player channel and restores its overlay on close',()=>{
 const target=new EventTarget(),original=Object.getOwnPropertyDescriptor(globalThis,'addEventListener')
 Object.defineProperty(globalThis,'addEventListener',{configurable:true,value:target.addEventListener.bind(target)})
 const style=new Map<string,string>(),classes=new Set<string>(),responses:any[]=[]
 const child={postMessage:(value:any)=>responses.push(value)}
 const frame={style:{setProperty:(key:string,value:string)=>style.set(key,value)},classList:{contains:(name:string)=>classes.has(name),toggle:(name:string,on:boolean)=>{if(on)classes.add(name);else classes.delete(name)},remove:(name:string)=>classes.delete(name)},contentWindow:child,getBoundingClientRect:()=>{const offset=parseFloat(style.get('--drive-menu-offset')||'0');return {top:300-offset,width:320,height:180+offset}}}
 const lifetime=new AbortController()
 try{
  setupPlayerPanelHost(frame as unknown as HTMLIFrameElement,'own',lifetime.signal)
  const send=(source:any,channel:string,open=true)=>{const event=new Event('message');Object.assign(event,{source,data:{channel,type:'playerPanel',open,height:420,mediaHeight:180,bottom:8,left:10,width:288}});target.dispatchEvent(event)}
  send({},'own');send(child,'wrong');assert.equal(responses.length,0)
  send(child,'own');assert.equal(style.get('--drive-menu-offset'),'256px');assert.equal(classes.has('has-player-panel-overflow'),true)
  assert.deepEqual(responses.at(-1),{channel:'own',type:'playerPanelSpace',offset:256,height:420})
  target.dispatchEvent(new Event('scroll'));assert.equal(style.get('--drive-menu-offset'),'256px')
  send(child,'own',false);assert.equal(classes.has('has-player-panel-overflow'),false);assert.equal(style.get('--drive-menu-offset'),'0px')
  const count=responses.length;target.dispatchEvent(new Event('scroll'));assert.equal(responses.length,count)
  lifetime.abort();send(child,'own');assert.equal(responses.length,count)
 }finally{lifetime.abort();if(original)Object.defineProperty(globalThis,'addEventListener',original);else Reflect.deleteProperty(globalThis,'addEventListener')}
})
