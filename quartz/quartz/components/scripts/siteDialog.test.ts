import {test} from 'node:test'
import assert from 'node:assert/strict'
import {showSiteDialog,closeSiteDialog} from './siteDialog'

test('shared drawers finish dismissal and ignore stale callbacks after rapid reopening',async()=>{
 const globals=globalThis as any,previousWindow=globals.window,previousStyle=globals.getComputedStyle
 let reduced=false,drawer=true
 class Motion{cancelled=false;onfinish:(()=>void)|null=null;cancel(){this.cancelled=true}}
 class Dialog extends EventTarget{
  open=false;attributes=new Set<string>();motions:Motion[]=[]
  hasAttribute(name:string){return this.attributes.has(name)}
  setAttribute(name:string){this.attributes.add(name)}
  removeAttribute(name:string){this.attributes.delete(name)}
  showModal(){this.open=true}
  close(){this.open=false}
  focus(){}
  animate(){const motion=new Motion();this.motions.push(motion);return motion}
 }
 globals.window={matchMedia:(query:string)=>({matches:query.includes('reduced-motion')?reduced:true})}
 globals.getComputedStyle=()=>({getPropertyValue:()=>drawer?'1':'',transform:'none',opacity:'1'})
 try{
  const element=new Dialog(),dialog=element as unknown as HTMLDialogElement
  showSiteDialog(dialog)
  assert.equal(element.open,true)
  const opening=element.motions.at(-1)!
  const dismissal=closeSiteDialog(dialog),closing=element.motions.at(-1)!
  assert.equal(opening.cancelled,true)
  assert.equal(closeSiteDialog(dialog),dismissal)
  showSiteDialog(dialog)
  await dismissal
  assert.equal(closing.cancelled,true)
  closing.onfinish?.()
  element.dispatchEvent(new Event('close'))
  assert.equal(element.open,true)
  const fresh=element.motions.at(-1)!
  assert.equal(fresh.cancelled,false,'a queued native close must not cancel the replacement entrance')
  const done=closeSiteDialog(dialog)
  element.motions.at(-1)!.onfinish?.();await done
  assert.equal(element.open,false)
  showSiteDialog(dialog)
  const escape=new Event('cancel',{cancelable:true});element.dispatchEvent(escape)
  assert.equal(escape.defaultPrevented,true)
  element.motions.at(-1)!.onfinish?.()
  assert.equal(element.open,false)
  reduced=true;const count=element.motions.length
  showSiteDialog(dialog);await closeSiteDialog(dialog)
  assert.equal(element.motions.length,count,'reduced motion must not start an animation')
  reduced=false;drawer=false
  showSiteDialog(dialog);await closeSiteDialog(dialog)
  assert.equal(element.open,false)
  assert.equal(element.motions.length,count,'centered dialogs keep their existing behavior')
 }finally{
  if(previousWindow===undefined)delete globals.window;else globals.window=previousWindow
  if(previousStyle===undefined)delete globals.getComputedStyle;else globals.getComputedStyle=previousStyle
 }
})
