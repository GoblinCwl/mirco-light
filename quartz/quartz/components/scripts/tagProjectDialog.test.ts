import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,mkdtemp,rm} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

test('rapid tag dialog close and reopen cancels stale animations and releases its source and scroll lock',async()=>{
 const cache=path.join(process.cwd(),'.quartz-cache');await mkdir(cache,{recursive:true})
 const directory=await mkdtemp(path.join(cache,'tag-dialog-'))
 const globals=globalThis as any,names=['document','matchMedia','getComputedStyle','__tagDialogFixture']
 const saved=names.map(name=>[name,Object.getOwnPropertyDescriptor(globals,name)] as const)
 class Motion {
  onfinish:(()=>void)|null=null
  cancelled=false
  cancel(){this.cancelled=true}
 }
 class Element extends EventTarget {
  open=false;isConnected=true;style={cssText:''};children:Element[]=[];attributes=new Set<string>();motions:Motion[]=[]
  textContent='';id='';tabIndex=0;type='';innerHTML='';scrollTop=0;hidden=false
  append(...children:Element[]){this.children.push(...children)}
  replaceChildren(...children:Element[]){this.children=children}
  setAttribute(name:string){this.attributes.add(name)}
  removeAttribute(name:string){this.attributes.delete(name)}
  querySelectorAll(){return []}
  getBoundingClientRect(){return {left:0,top:0,width:300,height:200}}
  animate(){const motion=new Motion();this.motions.push(motion);return motion}
  focus(){}
  remove(){this.isConnected=false}
  close(){this.open=false} // Native close events are queued; deliver them explicitly below.
 }
 let dialog:Element|undefined,locks=0,closed=0
 const fixture={
  node:(tag:string)=>{const element=new Element();if(tag==='dialog')dialog=element;return element},
  showSiteDialog:(element:Element)=>{element.open=true},
  lockPageScroll:()=>{locks++;let released=false;return ()=>{if(!released){released=true;locks--}}},
 }
 globals.__tagDialogFixture=fixture;globals.document={body:new Element()}
 globals.matchMedia=()=>({matches:false});globals.getComputedStyle=()=>({transform:'none',opacity:'1'})
 try{
  const exports:Record<string,string>={
   './driveUi':'export const node=globalThis.__tagDialogFixture.node',
   './siteDialog':'export const showSiteDialog=globalThis.__tagDialogFixture.showSiteDialog',
   './pageScrollLock':'export const lockPageScroll=globalThis.__tagDialogFixture.lockPageScroll',
   './infiniteScroll':'export const createInfiniteScroll=()=>({setEnabled(){}})',
   './videoPreview':'export const attachVideoPreview=()=>()=>{}',
   './driveClient':'export const drivePassword=()=>"";export const driveRoute=()=>({})',
   './tagOperations':'export const setupTagOperations=()=>{}',
   '../../util/contentTypeIcons':'export const contentTypeIcons={}',
   '../../util/encryptedIcon':'export const encryptedIcon=""',
   '../../util/tagClusters':'export const tagClusterStyle=()=>""',
   '../../util/tagProjects':'export const tagProjects=pages=>pages',
   '../../util/formatDate':'export const SITE_DATE_TIME_ZONE="Asia/Shanghai"',
  }
  const outfile=path.join(directory,'dialog.mjs')
  await build({entryPoints:['quartz/components/scripts/tagProjectDialog.ts'],outfile,bundle:true,platform:'node',format:'esm',plugins:[{name:'dialog-environment',setup(builder){
   builder.onResolve({filter:/^\./},args=>exports[args.path]?{path:args.path,namespace:'fixture'}:undefined)
   builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:exports[args.path],loader:'js'}))
  }}]})
  const {setupTagProjectDialog}=await import(pathToFileURL(outfile).href)
  const lifecycle=new AbortController(),panel=setupTagProjectDialog(lifecycle.signal,()=>closed++,()=>{})
  const first=new Element(),second=new Element()
  panel.show('first',[],first)
  const opening=dialog!.motions.at(-1)!
  panel.close()
  const staleClose=dialog!.motions.at(-1)!
  assert.ok(opening.cancelled)
  panel.close(true) // A fresh selection must finish an already-running close.
  assert.equal(panel.open,false)
  assert.equal(locks,0)
  assert.equal(closed,1)
  assert.equal(first.attributes.has('data-project-open'),false)
  panel.show('second',[],second)
  staleClose.onfinish?.() // Simulate a queued callback from the cancelled animation.
  dialog!.dispatchEvent(new Event('close')) // Delayed native event from the previous close.
  assert.ok(panel.open)
  assert.equal(closed,1)
  assert.equal(locks,1)
  assert.ok(second.attributes.has('data-project-open'))
  panel.close()
  const interrupted=dialog!.motions.at(-1)!
  panel.show('first',[],first) // Replacing content during close must also stay operable.
  assert.ok(interrupted.cancelled)
  interrupted.onfinish?.()
  assert.ok(panel.open)
  assert.equal(second.attributes.has('data-project-open'),false)
  assert.ok(first.attributes.has('data-project-open'))
  panel.close()
  dialog!.motions.at(-1)!.onfinish?.()
  dialog!.dispatchEvent(new Event('close'))
  assert.equal(panel.open,false)
  assert.equal(closed,2)
  assert.equal(locks,0)
  assert.equal(first.attributes.has('data-project-open'),false)
  panel.show('second',[],second);lifecycle.abort()
  assert.equal(locks,0)
  assert.equal(second.attributes.has('data-project-open'),false)
 }finally{
  for(const[name,descriptor]of saved){if(descriptor)Object.defineProperty(globals,name,descriptor);else delete globals[name]}
  await rm(directory,{recursive:true,force:true})
 }
})
