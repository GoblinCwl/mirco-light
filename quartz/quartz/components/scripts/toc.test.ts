import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {transformSync} from 'esbuild'

test('the last visible heading is the only scroll target and repeated scroll events do not restart it',()=>{
 const calls:number[]=[]
 const scroller={scrollHeight:1000,clientHeight:100,scrollTop:0,getBoundingClientRect:()=>({top:0,bottom:100}),scrollTo:({top}:{top:number})=>calls.push(top)}
 const headers=Array.from({length:5},(_,i)=>({id:`h${i}`,top:i*100,getBoundingClientRect(){return {top:this.top}}}))
 const entries=headers.map((header,i)=>({dataset:{for:header.id},classList:{toggle(){}},closest:()=>scroller,getBoundingClientRect:()=>({top:200+i*30,bottom:220+i*30,height:20})}))
 const doc=Object.assign(new EventTarget(),{getElementsByClassName:()=>[],querySelectorAll:(selector:string)=>selector.startsWith('h1')?headers:entries})
 const cleanup:(()=>void)[]=[],frames:(()=>void)[]=[]
 const window=Object.assign(new EventTarget(),{innerHeight:800,addCleanup:(fn:()=>void)=>cleanup.push(fn)})
 const source=transformSync(readFileSync(new URL('./toc.inline.ts',import.meta.url),'utf8'),{loader:'ts'}).code
 runInNewContext(source,{document:doc,window,requestAnimationFrame:(fn:()=>void)=>{frames.push(fn);return frames.length},cancelAnimationFrame(){}})
 doc.dispatchEvent(new Event('nav'))
 assert.deepEqual(calls,[280],'only the last visible heading should be revealed')
 const scroll=()=>{window.dispatchEvent(new Event('scroll'));frames.shift()?.()}
 scroll();scroll();assert.equal(calls.length,1,'do not restart smooth scrolling for the same heading')
 headers[4].top=900
 scroll();assert.deepEqual(calls,[280,250],'a changed active heading gets one new target')
 scroll();assert.equal(calls.length,2)
 cleanup.forEach(fn=>fn())
})
