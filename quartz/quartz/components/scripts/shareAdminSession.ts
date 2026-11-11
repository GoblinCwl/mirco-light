import {readSiteSession} from './siteSession'
import {showPasswordToast} from './passwordFeedback'
import {driveToken,setDriveToken,acceptDriveUser} from './driveClient'
import {sharedState} from './sharedRequest'
const state=sharedState('share-admin-session:v1',()=>({pending:undefined as Promise<void>|undefined,until:0,readyToken:"",listening:false}))
const key='quartz-share-admin-token'
function clear(){
 state.readyToken=""
 try{if(localStorage.getItem(key)===driveToken())setDriveToken('');localStorage.removeItem(key)}catch{}
}
export function syncShareAdminSession(fresh=false):Promise<void>{
 if(fresh)state.until=0
 if(state.pending)return state.pending
 if(Date.now()<state.until)return Promise.resolve()
 return state.pending=(async()=>{
  const identity=await readSiteSession(true,fresh)
  const result={...identity.share,authenticated:identity.authenticated}
  state.until=Date.now()+30000
  if(!result.authenticated||!result.configured){clear();return}
  if(typeof result.token==='string'){
   // The unified identity response already contains verified OpenList permissions.
   const changed=driveToken()!==result.token
   if(changed){setDriveToken(result.token);try{localStorage.setItem(key,result.token)}catch{}}
   if(result.user)acceptDriveUser(result.token,result.user)
   else throw Error(result.error||'Share 账户信息不可用')
   if(changed||state.readyToken!==result.token){state.readyToken=result.token;document.dispatchEvent(new CustomEvent('drive-admin-ready'))}
  }
 })().catch(error=>{
  if(fresh){showPasswordToast(error instanceof Error?error.message:'Share 自动登录失败',true);const toast=document.querySelector('.decrypt-toast');if(toast)document.querySelector('dialog:modal')?.append(toast)}
 }).finally(()=>{state.pending=undefined})
}
if(!state.listening){
 state.listening=true
 document.addEventListener('nav',()=>{if(/^\/Share(?:\/|$)/.test(location.pathname))void syncShareAdminSession()})
 document.addEventListener('stellar-share-settings-changed',()=>{void syncShareAdminSession(true)})
 document.addEventListener('stellar-auth-changed',event=>{
  if(!(event as CustomEvent).detail?.authenticated){state.until=0;clear();return}
  void syncShareAdminSession(true)
 })
}
