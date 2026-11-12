import {test} from 'node:test'
import assert from 'node:assert/strict'
import {sharedState} from './sharedRequest'
import {renderRepoMermaid} from './repoMermaid'

test('repository diagrams render after asynchronous markdown, isolate errors and respect cancellation',async()=>{
 const globals=globalThis as any,saved=['document','location'].map(key=>[key,Object.getOwnPropertyDescriptor(globals,key)] as const)
 const doc=new EventTarget() as any;doc.documentElement={getAttribute:()=> 'dark'}
 doc.createElement=()=>({textContent:'',className:''})
 globals.document=doc;globals.location={origin:'https://site.invalid'}
 const configs:Record<string,unknown>[]=[],sources:string[]=[]
 const fake={initialize:(config:Record<string,unknown>)=>configs.push(config),render:async(id:string,source:string)=>{sources.push(source);if(source==='broken')throw Error('bad syntax');return {svg:`<svg id="${id}"><text>${source}</text></svg>`}}}
 const state=sharedState('repo-mermaid:v1',()=>({module:Promise.resolve({default:fake}),queue:Promise.resolve(),serial:0}))
 state.module=Promise.resolve({default:fake})
 const pre=()=>({innerHTML:'',children:[] as any[],classList:{add:()=>{},remove:()=>{}},setAttribute:()=>{},replaceChildren(){this.children=[]},append(child:any){this.children.push(child)}})
 const a=pre(),b=pre(),host={querySelectorAll:()=>[{textContent:'graph TD; A-->B',parentElement:a},{textContent:'broken',parentElement:b}],contains:()=>true} as unknown as HTMLElement
 const lifecycle=new AbortController()
 try{
  await renderRepoMermaid(host,lifecycle.signal,svg=>svg.replace('<svg','<svg data-sanitized="yes"'))
  assert.match(a.innerHTML,/data-sanitized/);assert.match(a.innerHTML,/graph TD/)
  assert.equal(b.children[0].textContent,'broken');assert.match(b.children[1].textContent,/保留源代码/)
  assert.ok(configs.every(config=>config.securityLevel==='strict'&&config.startOnLoad===false))
  lifecycle.abort();const before=sources.length;await renderRepoMermaid(host,lifecycle.signal,svg=>svg);assert.equal(sources.length,before)
 }finally{lifecycle.abort();for(const[key,descriptor]of saved){if(descriptor)Object.defineProperty(globals,key,descriptor);else delete globals[key]}}
})
