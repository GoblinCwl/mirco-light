import {RequestCache,sharedState} from './sharedRequest'

const settings=sharedState('comment-empty:v1',()=>new RequestCache<string>(300000,1))
export async function commentEmpty(signal:AbortSignal){
 let text='暂无评论'
 try{
  text=await settings.read('text',async requestSignal=>{
   const response=await fetch('/artalk/api/v2/conf',{signal:AbortSignal.any([requestSignal,AbortSignal.timeout(5000)]),credentials:'omit'})
   if(!response.ok)throw Error('评论配置暂不可用')
   const data=await response.json(),value=data.frontend_conf?.noComment
   return typeof value==='string'&&value.trim()?value:'暂无评论'
  },{signal})
 }catch(error){if(signal.aborted)throw error}
 const empty=document.createElement('div');empty.className='atk-list-no-comment';empty.textContent=text
 return empty
}
