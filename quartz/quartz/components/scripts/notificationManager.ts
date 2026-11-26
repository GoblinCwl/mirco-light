import {node} from './driveUi'
import {showSiteDialog,closeSiteDialog} from './siteDialog'
import {showAdminListLoading,showAdminListMessage} from './adminListState'
import {adminPassword} from './driveAdminFields'
import {showPasswordToast} from './passwordFeedback'

type Request=(path:string,init?:RequestInit)=>Promise<any>
export function setupAPIToken(card:HTMLElement,signal:AbortSignal,request:Request){
 const row=document.createElement('div'),copy=document.createElement('div'),label=document.createElement('label'),help=document.createElement('small'),controls=document.createElement('div'),password=document.createElement('div'),generate=document.createElement('button'),copyToken=document.createElement('button'),state=document.createElement('small')
 row.className='stellar-setting-row';row.dataset.fieldType='password';copy.className='stellar-setting-copy';controls.className='stellar-setting-control';password.className='stellar-setting-password'
 const address=document.createElement('small');
 label.textContent='API Token';help.textContent='用于本站 API、站务通知和星芽对话。'
 const input=adminPassword(password,'MicroLight API Token','',true);input.readOnly=true;input.placeholder='尚未生成';input.id='stellar-api-token';label.htmlFor=input.id
 generate.type=copyToken.type='button';generate.textContent='生成 Token';copyToken.textContent='复制';copyToken.disabled=true;generate.disabled=true;state.setAttribute('role','status')
 copy.append(label,help,address,state);controls.append(password,generate,copyToken);row.append(copy,controls);card.append(row)
 let busy=false
 const load=async()=>{
  if(busy||signal.aborted)return;busy=true
  try{
   const result=await request('/admin/api-token');if(signal.aborted)return
   address.textContent='API 地址：'+location.origin+result.basePath
   generate.disabled=false;generate.textContent=result.configured?'重置 Token':'生成 Token';input.placeholder=result.configured?'已配置，重置后可复制新 Token':'尚未生成';state.textContent=result.configured?'已配置'+(result.createdAt?` · ${new Date(result.createdAt).toLocaleString('zh-CN')}`:''):'未配置'
  }catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'API 凭据状态加载失败',true)}finally{busy=false}
 }
 generate.onclick=async()=>{generate.disabled=true;try{const result=await request('/admin/api-token',{method:'POST'});if(signal.aborted)return;input.value=result.token;copyToken.disabled=false;showPasswordToast('Token 已生成，请复制到插件');await load()}catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'生成失败',true)}finally{generate.disabled=false}}
 copyToken.onclick=async()=>{try{await navigator.clipboard.writeText(input.value);showPasswordToast('已复制')}catch{input.focus();input.select();showPasswordToast('请手动复制 Token',true)}}
 rootDialog()?.addEventListener('close',()=>{input.value='';copyToken.disabled=true},{signal})
 function rootDialog(){return card.closest('dialog')}
 void load()
}

export function setupNotifications(card:HTMLElement,signal:AbortSignal,request:Request){
 const row=node('div','','stellar-setting-row stellar-security-row'),copy=node('div','','stellar-setting-copy'),open=node('button','查看记录','stellar-action-button')
 open.type='button';copy.append(node('strong','投递记录'));row.append(copy,open);card.append(row)
 const dialog=node('dialog','','observatory-dialog observatory-settings-dialog stellar-notification-dialog'),header=node('header','','observatory-auth-header'),title=node('h2','投递记录'),actions=node('div','','observatory-manage-actions'),refresh=node('button','刷新','observatory-manage-logout'),close=node('button','','observatory-manage-close'),body=node('div','','stellar-admin stellar-notification-content')
 dialog.tabIndex=-1;dialog.setAttribute('aria-label','投递记录');refresh.type=close.type='button';close.setAttribute('aria-label','关闭投递记录');close.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>'
 actions.append(refresh,close);header.append(title,actions);dialog.append(header,body);card.append(dialog)
 let version=0,busy=false
 const load=async()=>{
  if(busy||signal.aborted||!dialog.open)return
  busy=true;refresh.disabled=true;const own=++version
  showAdminListLoading(body)
  try{
   const result=await request('/admin/notifications');if(signal.aborted||own!==version||!dialog.open)return
   if(!result.items.length){showAdminListMessage(body,'暂无投递记录','');return}
   const list=node('div','','feedback-admin-list')
   for(const item of result.items){
    const entry=node('section','','feedback-admin-item'),heading=node('header'),titleCopy=node('div','','friend-admin-copy'),recordTitle=node('strong'),detail=node('p','','feedback-admin-meta'),buttons=node('div','','feedback-admin-actions')
    const kind=({alerts:'告警',feedback:'反馈',friends:'友链'} as Record<string,string>)[item.kind]||item.kind
    recordTitle.textContent=`${kind} · ${item.recordId}`;detail.textContent=`${({pending:'等待投递',delivered:'插件已接收',failed:'投递失败'} as Record<string,string>)[item.state]||item.state} · 尝试 ${item.attempts} 次 · ${new Date(item.createdAt).toLocaleString('zh-CN')}${item.error?' · '+item.error:''}`
    if(item.state!=='delivered'){
     const retry=node('button','重试');retry.type='button'
     retry.onclick=async()=>{retry.disabled=true;try{await request('/admin/notifications/retry/'+encodeURIComponent(item.id),{method:'POST'});if(own===version)await load()}catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'重试失败',true)}finally{retry.disabled=false}}
     buttons.append(retry)
    }
    titleCopy.append(recordTitle);heading.append(titleCopy,buttons);entry.append(heading,detail);list.append(entry)
   }
   body.replaceChildren(list);body.removeAttribute('aria-busy')
  }catch(error){if(!signal.aborted&&own===version&&dialog.open)showAdminListMessage(body,'投递记录加载失败',error instanceof Error?error.message:'请稍后重试',()=>void load())}
  finally{if(own===version){busy=false;refresh.disabled=false;body.removeAttribute('aria-busy')}}
 }
 open.onclick=()=>{if(!dialog.open)showSiteDialog(dialog);void load()}
 refresh.onclick=()=>void load();close.onclick=()=>void closeSiteDialog(dialog)
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)void closeSiteDialog(dialog)},{signal})
 dialog.addEventListener('close',()=>{version++;busy=false;refresh.disabled=false;body.replaceChildren();body.removeAttribute('aria-busy')},{signal})
 card.closest('dialog')?.addEventListener('close',()=>{if(dialog.open)dialog.close()},{signal})
 signal.addEventListener('abort',()=>{version++;if(dialog.open)dialog.close();dialog.remove()},{once:true})
}
