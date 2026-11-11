import {readContentCatalog} from './contentCatalog'
import {tagPrefixes} from './shareContent'
import {slugTag} from '../../util/path'

/** Wait only for the current edit's publication; no idle polling or global timer. */
export async function waitForTagPublication(ids:string[],tag:string,remove:boolean,signal:AbortSignal){
 const expected=slugTag(tag),deadline=Date.now()+45000
 while(!signal.aborted){
  const catalog=await readContentCatalog({refresh:true,signal})
  if(ids.every(id=>{const page=Object.values(catalog.pages).find(page=>page.id===id);return page&&tagPrefixes(page.tags).includes(expected)!==remove}))return
  if(Date.now()>=deadline)throw Error('标签已保存，文章热更新尚未完成，请稍后刷新')
  await new Promise<void>((resolve,reject)=>{
   const cancel=()=>{clearTimeout(timer);reject(signal.reason)}
   const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve()},500)
   signal.addEventListener('abort',cancel,{once:true})
   if(signal.aborted)cancel()
  })
 }
 signal.throwIfAborted()
}
