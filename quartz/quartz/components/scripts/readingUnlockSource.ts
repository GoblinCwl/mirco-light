import {readingExcerpt,rememberReadingUnlock} from './readingUnlock'
import {readingDestination,type ReadingItem} from './readingView'
import {base64} from 'rfc4648'
import {readDriveShareCode} from './driveCredentials'
import {driveRoute} from '../../util/driveRoutes.mjs'

function plain(html:string){const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,button,form,nav,.meld-encrypted-block').forEach(node=>node.remove());return doc.body.textContent||''}
function cached(key:string){for(const storage of [localStorage,sessionStorage]){const raw=storage.getItem(key);if(!raw)continue;try{const value=JSON.parse(raw);if(value.key&&value.expires>Date.now())return value as {key:JsonWebKey;expires:number}}catch{}}return null}
async function article(item:ReadingItem,signal:AbortSignal):Promise<string|null>{
 const href=readingDestination(item.href);if(href==='#')return null
 const slug=decodeURIComponent(new URL(href,location.origin).pathname).replace(/^\//,'').replace(/\/(?:index)?$/,'')
 const prefix=`quartz-encrypted:${slug}:v2:`
 let hasKey=false
 for(const storage of [localStorage,sessionStorage])for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith(prefix)&&key.endsWith(':content')&&cached(key))hasKey=true}
 if(!hasKey)return null
 const response=await fetch(href,{signal,credentials:'omit'});if(!response.ok)return null
 const doc=new DOMParser().parseFromString(await response.text(),'text/html'),lock=doc.querySelector<HTMLElement>('#lock[data-payload-url]')
 if(!lock?.dataset.cacheId||!lock.dataset.payloadUrl)return null
 const contentKey=cached(`quartz-encrypted:${lock.dataset.cacheId}:content`),tocKey=cached(`quartz-encrypted:${lock.dataset.cacheId}:toc`)
 if(!contentKey||!tocKey)return null
 const payloadURL=new URL(lock.dataset.payloadUrl,response.url);if(payloadURL.origin!==location.origin)return null
 const payloadResponse=await fetch(payloadURL,{signal,credentials:'omit'});if(!payloadResponse.ok)return null
 const payload=await payloadResponse.json();if(typeof payload.content!=='string'||typeof payload.toc!=='string')return null
 const bytes=base64.parse(payload.content),toc=base64.parse(payload.toc);if(bytes.length<64||toc.length<64)return null
 const hex=(data:Uint8Array)=>Array.from(data,byte=>byte.toString(16).padStart(2,'0')).join('')
 const id=`${doc.body.dataset.slug}:v2:${hex(bytes.slice(0,16))}:${hex(toc.slice(0,16))}`
 if(id!==lock.dataset.cacheId)return null
 const key=await crypto.subtle.importKey('jwk',contentKey.key,'AES-GCM',false,['decrypt'])
 const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(32,48)},key,bytes.slice(48))
 return plain(new TextDecoder().decode(decrypted))
}
async function share(item:ReadingItem,signal:AbortSignal):Promise<string|null>{
 const route=driveRoute(new URL(item.href,location.origin));if(!route.valid||route.view!=='share')return null
 const code=readDriveShareCode(route.share);if(!code)return null
 const {driveRequest}=await import('./driveClient')
 const path=`/@s/${route.share}${route.path==='/'?'':route.path}`
 const options={anonymous:true,signal},body={path,password:code}
 const meta=await driveRequest<{is_dir:boolean;header?:string;readme?:string}>('fs/get',body,options)
 if(!meta.is_dir)return plain(meta.header||meta.readme||'')
 const listing=await driveRequest<{header?:string;readme?:string;content?:{name:string}[]}>('fs/list',{...body,page:1,per_page:20},options)
 return plain(listing.header||listing.readme||meta.header||meta.readme||'')||listing.content?.map(file=>file.name).join('、')||''
}
export async function resolveReadingExcerpt(item:ReadingItem,signal:AbortSignal):Promise<string|null>{
 const known=readingExcerpt(item);if(known!==null)return known
 if(!item.encrypted)return null
 try{
  const source=AbortSignal.any([signal,AbortSignal.timeout(12000)])
  const text=item.type==='article'?await article(item,source):item.type==='share'?await share(item,source):null
  if(text===null||signal.aborted)return null
  rememberReadingUnlock(item.href,text)
  return readingExcerpt(item)
 }catch{return null}
}
