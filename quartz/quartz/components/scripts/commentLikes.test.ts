import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setCommentLikes } from './commentLikes'

class Element {
  children: Element[] = []
  parent?: Element
  className = ''
  textContent = ''
  dataset: Record<string,string> = {}
  attrs = new Map<string,string>()
  disabled = false
  type = ''
  onclick?: (event: {stopPropagation:()=>void})=>void
  classList = { toggle: (_:string, _value:boolean)=>{} }
  constructor(public tagName: string) { this.tagName=tagName.toUpperCase() }
  querySelector() { return this.children.find(child=>child.className==='comment-like-count') || null }
  setAttribute(key:string,value:string) { this.attrs.set(key,value) }
  append(...children:Element[]) { children.forEach(child=>{child.parent=this;this.children.push(child)}) }
  replaceChildren(...children:Element[]) {this.children=[];this.append(...children)}
  remove() {if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this)}
}

test('site zero-like entry remains a native button and delegates voting without triggering reply',()=>{
  Object.assign(globalThis,{document:{createElement:(tag:string)=>new Element(tag),createElementNS:(_:string,tag:string)=>new Element(tag)}})
  const header=new Element('div');let votes=0,stopped=0
  const click=()=>{votes++}
  setCommentLikes(header as unknown as HTMLElement,0,{click,active:false,pending:false})
  const button=header.children[0]
  assert.equal(button.tagName,'BUTTON')
  button.onclick!({stopPropagation:()=>stopped++})
  assert.equal(votes,1);assert.equal(stopped,1)
  setCommentLikes(header as unknown as HTMLElement,0,{click,active:false,pending:true})
  assert.equal(header.children[0],button)
  assert.equal(button.disabled,true)
  setCommentLikes(header as unknown as HTMLElement,1,{click,active:true,pending:false})
  assert.equal(header.children[0],button)
  assert.equal(button.disabled,false)
  assert.equal(button.attrs.get('aria-pressed'),'true')
  assert.equal(button.dataset.likes,'1')
})

test('Bilibili count stays read-only and zero stays hidden',()=>{
  Object.assign(globalThis,{document:{createElement:(tag:string)=>new Element(tag),createElementNS:(_:string,tag:string)=>new Element(tag)}})
  const header=new Element('div')
  setCommentLikes(header as unknown as HTMLElement,3)
  assert.equal(header.children[0].tagName,'SPAN')
  assert.equal(header.children[0].onclick,undefined)
  setCommentLikes(header as unknown as HTMLElement,0)
  assert.equal(header.children.length,0)
})
