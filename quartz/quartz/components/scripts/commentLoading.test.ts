import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commentLoading } from './commentLoading'

class Element {
  children: Element[] = []
  parent?: Element
  className = ''
  textContent = ''
  style = { minHeight: '', overflowAnchor: '', top: '' }
  attrs = new Map<string,string>()
  classes = new Set<string>()
  classList = { add: (...names:string[]) => names.forEach(n=>this.classes.add(n)), remove: (...names:string[])=>names.forEach(n=>this.classes.delete(n)) }
  contentHeight = 0
  getBoundingClientRect() { return { top: 300, height: Math.max(this.contentHeight,parseFloat(this.style.minHeight)||0) } }
  setAttribute(key:string,value:string) { this.attrs.set(key,value) }
  removeAttribute(key:string) { this.attrs.delete(key) }
  append(...items:Element[]) { for(const item of items){item.parent=this;this.children.push(item)} }
  remove() { if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this) }
}

test('local sorting loader keeps old content and reserves height without scrolling; cleanup restores styles',()=>{
  Object.assign(globalThis,{document:{createElement:()=>new Element()},window:{innerHeight:800,scrollTo:()=>assert.fail('sorting must not scroll'),scrollBy:()=>assert.fail('sorting must not scroll')}})
  const stage=new Element(),old=new Element();stage.contentHeight=2000;stage.append(old)
  const loading=commentLoading(stage as unknown as HTMLElement)
  loading.begin();loading.begin()
  assert.equal(stage.children.length,2)
  assert.equal(stage.children[0],old)
  assert.equal(stage.style.minHeight,'2000px')
  stage.contentHeight=0 // Artalk clears its native rows while the request is pending.
  assert.equal(stage.getBoundingClientRect().height,2000)
  loading.finish()
  assert.equal(stage.style.minHeight,'500px')
  assert.equal(stage.attrs.get('aria-busy'),'false')
  assert.equal(stage.children.length,1)
  loading.begin();loading.dispose();loading.finish()
  assert.equal(stage.style.minHeight,'')
  assert.equal(stage.style.overflowAnchor,'')
  assert.equal(stage.attrs.has('aria-busy'),false)
  assert.equal(stage.children.length,1)
})

test('initial empty comment response does not leave a permanent loading-sized gap',()=>{
  Object.assign(globalThis,{document:{createElement:()=>new Element()},window:{innerHeight:800}})
  const stage=new Element(),loading=commentLoading(stage as unknown as HTMLElement)
  loading.begin();loading.finish()
  assert.equal(stage.style.minHeight,'')
  assert.equal(stage.children.length,0)
})
