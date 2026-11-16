import {test} from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {buildSync} from 'esbuild'

test('the last visible heading is the only scroll target and repeated scroll events do not restart it',()=>{
 const calls:number[]=[]
 const scroller={scrollHeight:1000,clientHeight:100,scrollTop:0,getBoundingClientRect:()=>({top:0,bottom:100}),scrollTo:({top}:{top:number})=>calls.push(top)}
 const headers=Array.from({length:5},(_,i)=>({id:`h${i}`,top:i*100,getBoundingClientRect(){return {top:this.top}}}))
 const entries=headers.map((header,i)=>({dataset:{for:header.id},classList:{toggle(){}},closest:()=>scroller,getBoundingClientRect:()=>({top:200+i*30,bottom:220+i*30,height:20})}))
 const doc=Object.assign(new EventTarget(),{getElementsByClassName:()=>[],querySelectorAll:(selector:string)=>selector.startsWith('h1')?headers:entries})
 const cleanup:(()=>void)[]=[],frames:(()=>void)[]=[]
 const window=Object.assign(new EventTarget(),{scrollY:0,innerHeight:800,addCleanup:(fn:()=>void)=>cleanup.push(fn)})
 const source=buildSync({entryPoints:[new URL('./toc.inline.ts',import.meta.url).pathname],bundle:true,write:false}).outputFiles[0].text
 runInNewContext(source,{document:doc,window,requestAnimationFrame:(fn:()=>void)=>{frames.push(fn);return frames.length},cancelAnimationFrame(){}})
 doc.dispatchEvent(new Event('nav'))
 assert.deepEqual(calls,[280],'only the last visible heading should be revealed')
 const scroll=()=>{window.dispatchEvent(new Event('scroll'));frames.shift()?.()}
 scroll();scroll();assert.equal(calls.length,1,'do not restart smooth scrolling for the same heading')
 headers[4].top=900
 window.dispatchEvent(new Event('resize'))
 scroll();assert.deepEqual(calls,[280,250],'a changed active heading gets one new target')
 scroll();assert.equal(calls.length,2)
 cleanup.forEach(fn=>fn())
})

test('long articles do not remeasure headings or rewrite the whole TOC on scroll',()=>{
 let reads=0,writes=0
 const operations:string[]=[]
 const window=Object.assign(new EventTarget(),{scrollY:0,innerHeight:300,addCleanup:(fn:()=>void)=>cleanup.push(fn)})
 const cleanup:(()=>void)[]=[],frames:(()=>void)[]=[]
 const list={scrollHeight:100,clientHeight:100}
 const headers=Array.from({length:1000},(_,i)=>({id:`h${i}`,getBoundingClientRect(){reads++;operations.push('read');return {top:i*30-window.scrollY}}}))
 const entries=headers.map(header=>({dataset:{for:header.id},closest:()=>list,classList:{toggle(){writes++;operations.push('write')}}}))
 const doc=Object.assign(new EventTarget(),{getElementsByClassName:()=>[],querySelectorAll:(selector:string)=>selector.startsWith('h1')?headers:entries})
 const source=buildSync({entryPoints:[new URL('./toc.inline.ts',import.meta.url).pathname],bundle:true,write:false}).outputFiles[0].text
 runInNewContext(source,{document:doc,window,requestAnimationFrame:(fn:()=>void)=>{frames.push(fn);return frames.length},cancelAnimationFrame(){}})
 doc.dispatchEvent(new Event('nav'))
 assert.equal(reads,1000)
 assert.ok(operations.slice(0,1000).every(operation=>operation==='read'),'geometry reads must precede class writes')
 for(let i=0;i<500;i++){
  window.scrollY+=10;window.dispatchEvent(new Event('scroll'));frames.shift()?.()
 }
 assert.equal(reads,1000,'500 scrolling frames must not cause another heading measurement')
 assert.ok(writes<1500,`only changed heading states should be written, got ${writes}`)
 window.dispatchEvent(new Event('resize'));frames.shift()?.()
 assert.equal(reads,2000,'layout changes refresh the geometry cache')
 cleanup.forEach(fn=>fn())
})
