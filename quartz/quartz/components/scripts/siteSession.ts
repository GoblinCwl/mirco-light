import {RequestCache,sharedState} from './sharedRequest'
export type SiteSession={authenticated:boolean;totpEnabled?:boolean;share?:{configured:boolean;token?:string;user?:{username:string;role:number;base_path:string;permission?:number};error?:string}}
const state=sharedState('site-session:v1',()=>({requests:new RequestCache<SiteSession>(30000,2),listening:false}))
if(typeof document!=='undefined'&&!state.listening){state.listening=true;for(const event of ['stellar-auth-changed','stellar-share-settings-changed'])document.addEventListener(event,()=>state.requests.clear())}
export function readSiteSession(share=false,fresh=false):Promise<SiteSession>{
 share=share||typeof location!=='undefined'&&/^\/Share(?:\/|$)/.test(location.pathname)
 if(fresh)state.requests.clear()
 return state.requests.read(share?'share':'site',async signal=>{
  const response=await fetch('/api/site/session'+(share?'?share=true':''),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])})
  const value=await response.json();if(!response.ok)throw Error(value.error||'登录状态读取失败')
  return value
 })
}
