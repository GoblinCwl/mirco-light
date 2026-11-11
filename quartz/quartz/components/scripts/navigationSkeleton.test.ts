import {test} from 'node:test'
import assert from 'node:assert/strict'
import {runInNewContext} from 'node:vm'
import {rememberNavigationSkeleton,restoreNavigationSkeleton} from './navigationSkeleton'

class Node {
 children:Node[]=[];className='';textContent='';attributes=new Map<string,string>()
 append(...nodes:Node[]){this.children.push(...nodes)}
 prepend(node:Node){this.children.unshift(node)}
 setAttribute(key:string,value:string){this.attributes.set(key,value)}
 getAttribute(key:string){return this.attributes.get(key)??null}
 querySelector(selector:string){return this.children.find(node=>selector==='.'+node.className)||null}
 replaceChildren(fragment:Node){this.children=[...fragment.children]}
}
function restore(layout:unknown,busy=true){
 const container=new Node(),end=new Node();end.className='overflow-end';container.append(end)
 container.setAttribute('aria-busy',String(busy))
 // Execute the exact serialized bootstrap used by the generated HTML.
 runInNewContext(`(${restoreNavigationSkeleton.toString()})(container)`,{
  container,localStorage:{getItem:()=>JSON.stringify(layout)},
  document:{createElement:()=>new Node(),createDocumentFragment:()=>new Node()},
 })
 return {container,end}
}
test('navigation skeleton follows configured link/registration counts and retains the overflow marker',()=>{
 const {container,end}=restore({links:['RSS','外链二','外链三','外链四'],registrations:[{label:'ICP备案',icon:false},{label:'公安备案',icon:true}]})
 assert.equal(container.children.length,8)
 assert.equal(container.children[0].children[1].textContent,'RSS')
 assert.equal(container.children[4].className,'home-registration-divider')
 assert.equal(container.children[5].children[0].textContent,'ICP备案')
 assert.equal(container.children[6].children[0].children[0].className,'home-registration-icon')
 assert.equal(container.children[7],end)
 const empty=restore({links:[],registrations:[]});assert.deepEqual(empty.container.children,[empty.end])
})
test('invalid cache and already-rendered navigation remain untouched',()=>{
 for(const layout of [null,{}, {links:['ok'],registrations:[null]}, {links:Array(61).fill('x'),registrations:[]}]){
  const {container,end}=restore(layout);assert.deepEqual(container.children,[end])
 }
 const {container,end}=restore({links:['ok'],registrations:[]},false);assert.deepEqual(container.children,[end])
})
test('layout cache contains public labels and icon presence, not addresses or SVG',()=>{
 const previous=globalThis.localStorage
 let raw=''
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{setItem:(_key:string,value:string)=>{raw=value}}})
 try{
  const links=[{label:'链接',href:'/private'}]
  rememberNavigationSkeleton(links,[{label:'备案',icon:'<svg/>'}])
  assert.deepEqual(JSON.parse(raw),{links:['链接'],registrations:[{label:'备案',icon:true}]})
 }finally{if(previous===undefined)delete (globalThis as any).localStorage;else Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previous})}
})
