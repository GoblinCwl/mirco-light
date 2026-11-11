import {sharedState} from './sharedRequest'
const state=sharedState('visitor-recording:v1',()=>({browserId:'',generation:0,listening:false,pending:undefined as Promise<void>|undefined}))
function browserId(){
 try{
  const stored=localStorage.getItem('quartz-visitor-id')
  if(stored&&/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(stored))state.browserId=stored
  if(!state.browserId)state.browserId=crypto.randomUUID()
  localStorage.setItem('quartz-visitor-id',state.browserId)
 }catch{if(!state.browserId)state.browserId=crypto.randomUUID()}
 return state.browserId
}
export function recordCurrentVisit(){
 const generation=++state.generation
 const pending:Promise<void>=fetch('/api/visitors/visit',{
  method:'POST',credentials:'omit',cache:'no-store',keepalive:true,
  headers:{'X-Visitor-ID':browserId()},signal:AbortSignal.timeout(12000),
 }).then(async response=>{
  if(!response.ok||response.status===202)return
  try{
   const data=await response.json() as {meteorId?:unknown}
   if(typeof data.meteorId==='string'&&/^[a-f\d]{24}$/i.test(data.meteorId))localStorage.setItem('quartz-visitor-meteor-id',data.meteorId)
  }catch{/* Recording still succeeds if the response body or local storage is unavailable. */}
  if(generation===state.generation)document.dispatchEvent(new Event('visitor-recorded'))
 }).catch(()=>{/* Statistics must never interrupt navigation. */}).finally(()=>{if(state.pending===pending)state.pending=undefined})
 state.pending=pending
 return pending
}
// Let the homepage query its initial summary after the page's write. A stalled
// recorder cannot hold the statistics skeleton indefinitely.
export function waitForVisitorRecord(maxWait=2000):Promise<void>{
 const pending=state.pending
 if(!pending)return Promise.resolve()
 return new Promise(resolve=>{const timer=setTimeout(resolve,maxWait);void pending.finally(()=>{clearTimeout(timer);resolve()})})
}
export function setupVisitorTracking(){
 if(state.listening)return
 state.listening=true
 document.addEventListener('nav',()=>{void recordCurrentVisit()})
}
