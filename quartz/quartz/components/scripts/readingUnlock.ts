import {sharedState} from './sharedRequest'
import type {ReadingItem} from './readingView'
// Only validated decrypted text is kept, in tab memory rather than browser storage.
const state=sharedState('reading-unlocked:v2',()=>({previews:new Map<string,{text:string;at:number;expires:number}>(),listening:false}))
function key(href:string){try{return decodeURIComponent(new URL(href,'https://reading.invalid').pathname).replace(/\/(?:index(?:\.html)?)?$/,'').replace(/\.html$/,'')}catch{return href}}
export function rememberReadingUnlock(href:string,text:string){const at=Date.now();state.previews.set(key(href),{text:Array.from(text.replace(/\s+/g,' ').trim()).slice(0,2400).join(''),at,expires:at+12*60*60*1000})}
if(typeof document!=='undefined'&&!state.listening){
 state.listening=true
 document.addEventListener('reading-content-unlocked',event=>{const detail=(event as CustomEvent).detail;if(typeof detail?.href==='string'&&typeof detail?.text==='string')rememberReadingUnlock(detail.href,detail.text)})
}
export function readingExcerpt(item:ReadingItem):string|null {
 const entry=state.previews.get(key(item.href))
 if(entry){
  if(entry.expires<=Date.now()||(Date.parse(item.updatedAt||'')||0)>entry.at)state.previews.delete(key(item.href))
  else return entry.text
 }
 // The gate applies to every content type, including protected Share entries.
 if(item.encrypted||/🔐[βγ]|\[加密文本\]/.test(item.excerpt))return null
 return item.excerpt
}
