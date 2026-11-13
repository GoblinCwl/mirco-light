import {showPasswordToast} from './passwordFeedback'
type BuildStatus={phase:string;message:string;active?:{ignorePatterns:string[];unlistedPatterns:string[];directoryHiddenPatterns?:string[]}}
export function setupContentPublishing(panel:HTMLElement,signal:AbortSignal,request:(path:string,init?:RequestInit)=>Promise<any>){
 const card=document.createElement('section'),heading=document.createElement('h3'),row=document.createElement('div'),copy=document.createElement('div'),description=document.createElement('p'),state=document.createElement('span'),button=document.createElement('button')
 card.className='stellar-setting-card';heading.textContent='应用配置';row.className='stellar-build-actions';description.textContent='先保存规则，再重载站点。重载会重新生成页面与公开索引，期间请稍候。';state.setAttribute('role','status');state.className='stellar-build-status';button.type='button';button.className='stellar-action-button';button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg><span>重载站点</span>';copy.append(description,state);row.append(copy,button);card.append(heading,row);panel.append(card)
 let pending=false,timer:ReturnType<typeof setTimeout>|undefined,status:BuildStatus|undefined
 const unapplied=()=>status?.active&&(['ignorePatterns','unlistedPatterns','directoryHiddenPatterns'] as const).some(key=>{const input=panel.querySelector<HTMLTextAreaElement>(`#stellar-setting-content-${key}`);return input&&input.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean).join('\n')!==(status!.active![key]??[]).join('\n')})
 const dirty=()=>!!panel.querySelector('form.is-dirty')
 const update=()=>{button.disabled=pending||status?.phase==='running'||dirty();button.querySelector('span')!.textContent=pending||status?.phase==='running'?'正在重载…':'重载站点';state.textContent=dirty()?'有未保存规则，请先保存':status?.phase==='running'?'正在构建站点':unapplied()?'规则已保存，尚未生效，请重载站点':status?'':'正在确认构建服务';state.classList.toggle('is-error',status?.phase==='error')}
 const load=async()=>{
  try{const previous=status;status=await request('/admin/build');if(signal.aborted)return;if(status?.phase==='error'&&previous?.message!==status.message)showPasswordToast(status.message,true);else if(previous?.phase==='running'&&status?.phase!=='running')showPasswordToast(status?.message||'站点重载完成');update();if(status?.phase==='running')timer=setTimeout(()=>void load(),2000)}
  catch(error){if(!signal.aborted){status={phase:'error',message:error instanceof Error?error.message:'读取重载状态失败'};showPasswordToast(status.message,true);update()}}
 }
 button.onclick=async()=>{
  if(pending||dirty()||status?.phase==='running')return
  pending=true;update()
  try{status=await request('/admin/build',{method:'POST'});if(!signal.aborted){showPasswordToast('已开始重载站点');timer=setTimeout(()=>void load(),1000)}}
  catch(error){if(!signal.aborted){status={phase:'error',message:error instanceof Error?error.message:'重载失败'};showPasswordToast(status.message,true)}}
  finally{pending=false;if(!signal.aborted)update()}
 }
 panel.addEventListener('stellar-setting-change',update,{signal})
 signal.addEventListener('abort',()=>clearTimeout(timer),{once:true})
 void load()
}
