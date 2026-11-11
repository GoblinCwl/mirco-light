import {test} from 'node:test'
import assert from 'node:assert/strict'
import {retainFavicon} from './faviconPersistence'

class Icon {
 attributes=new Map<string,string>()
 constructor(public href:string){}
 setAttribute(name:string,value:string){this.attributes.set(name,value)}
 removeAttribute(name:string){this.attributes.delete(name)}
}
const doc=(icon:Icon|null)=>({head:{querySelector:()=>icon}} as unknown as Document)

test('SPA retains the same favicon element across repeated article and project navigation',()=>{
 const current=new Icon('https://goblincwl.site/favicon.ico?v=avatar-20261111')
 for(let i=0;i<3;i++){
  const incoming=new Icon(current.href)
  retainFavicon(doc(current),doc(incoming))
  assert.equal(current.attributes.has('data-persist'),true)
  assert.equal(incoming.attributes.has('data-persist'),true)
 }
})
test('changed or absent favicon releases persistence so head reconciliation can update it',()=>{
 const previous=new Icon('/favicon.ico?v=old'),same=new Icon(previous.href)
 retainFavicon(doc(previous),doc(same))
 const next=new Icon('/favicon.ico?v=new')
 retainFavicon(doc(previous),doc(next))
 assert.equal(previous.attributes.has('data-persist'),false)
 assert.equal(next.attributes.has('data-persist'),false)
 retainFavicon(doc(previous),doc(null))
 assert.equal(previous.attributes.has('data-persist'),false)
 retainFavicon(doc(null),doc(next))
 assert.equal(next.attributes.has('data-persist'),false)
})
