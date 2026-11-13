import {node} from './driveUi'
import {showPasswordToast} from './passwordFeedback'
import {renderAdminPagination} from './adminPagination'
import {showSiteDialog} from './siteDialog'
type Run={id:number;startedAt:string;finishedAt:string;status:string;durationMs:number;error:string;logs:string}
type Task={key:string;name:string;kind:string;periodKey?:string;hasQueue:boolean;retryable?:boolean;schedule:string;lastRun:Run|null;remaining:number;waiting:number;running:number}
type Item={id:string;label:string;state:string;attempts:number;availableAt:string;error:string}
type Detail={task:Task;runs:Run[];queue:{items:Item[];total:number;waiting:number;running:number;page:number;pages:number}}
const status:Record<string,string>={success:'成功',failed:'失败',running:'执行中',interrupted:'已中断',pending:'等待执行',retry:'等待重试'}
const date=(value:string)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—'
const duration=(ms:number)=>ms<1000?`${ms} 毫秒`:`${(ms/1000).toFixed(1)} 秒`
const badge=(value:string)=>{const el=node('span',status[value]||'尚未运行','task-run-status');el.dataset.status=value;return el}
export function setupTaskInstances(root:HTMLElement,signal:AbortSignal,request:(path:string,init?:RequestInit)=>Promise<any>,configuration?:HTMLElement){
 let selected='',page=1,busy=false,detailBusy=false,version=0,lastError='',opened=new Set<number>()
 const toolbar=node('div','','task-instance-toolbar'),hint=node('span','执行时间均为北京时间，保留每个任务最近 10 次执行记录。'),refresh=node('button','刷新'),state=node('p','正在读取任务…','task-instance-state'),list=node('div','','task-instance-list'),dialog=node('dialog','','task-log-dialog'),detail=node('section','','task-instance-detail')
 refresh.type='button';refresh.className='stellar-action-button';toolbar.append(hint,refresh);dialog.setAttribute('aria-label','任务执行日志');dialog.tabIndex=-1;dialog.append(detail);root.append(toolbar,state,list,dialog)
 const settings=new Map<string,HTMLElement>()
 for(const row of configuration?.querySelectorAll<HTMLElement>('[data-setting-key]')??[])settings.set(row.dataset.settingKey!,row)
 const assigned=new Set<string>(),groups=new Map<string,HTMLElement>(),cards=new Map<string,{card:HTMLElement;schedule:HTMLElement;time:HTMLElement;result:HTMLElement;error:HTMLElement;queue:HTMLElement;retry:HTMLButtonElement}>()
 const cell=(row:HTMLElement,text:string,className='')=>{const td=node('td',text,className);row.append(td);return td}
 const table=(heads:string[])=>{const wrap=node('div','','task-table-wrap'),table=node('table','','task-table'),head=node('thead'),row=node('tr'),body=node('tbody');for(const title of heads){const th=node('th',title);th.scope='col';row.append(th)};head.append(row);table.append(head,body);wrap.append(table);return {wrap,body}}
 const loadDetail=async()=>{
  if(!selected||!dialog.open||detailBusy||signal.aborted)return
  detailBusy=true;const key=selected,own=++version
  try{const value:Detail=await request(`/admin/tasks/${encodeURIComponent(key)}?page=${page}`);if(signal.aborted||own!==version||key!==selected||!dialog.open)return;page=value.queue.page;renderDetail(value)}
  catch(error){if(!signal.aborted&&own===version)showPasswordToast(error instanceof Error?error.message:'任务详情读取失败',true)}finally{if(own===version)detailBusy=false}
 }
 const retryTask=async(key:string,button:HTMLButtonElement)=>{
  if(button.disabled)return;button.disabled=true;button.textContent='提交中…'
  try{await request(`/admin/tasks/${encodeURIComponent(key)}/retry`,{method:'POST',body:'{}'});showPasswordToast('已提交重试');button.hidden=true;await load()}
  catch(error){showPasswordToast(error instanceof Error?error.message:'重试失败',true)}
  finally{button.disabled=false;button.textContent='重试'}
 }
 const select=(key:string)=>{selected=key;page=1;opened.clear();version++;detailBusy=false;detail.replaceChildren(node('p','正在读取执行记录…'));if(!dialog.open)showSiteDialog(dialog);void loadDetail()}
 dialog.addEventListener('close',()=>{selected='';version++;detailBusy=false})
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close()},{signal})
 const attachSettings=(host:HTMLElement,keys:string[])=>{
  for(const key of keys){const row=settings.get(key);if(row&&!assigned.has(key)){host.append(row);assigned.add(key)}}
 }
 const renderList=(tasks:Task[])=>{
  for(const [kind,label] of [['periodic','周期任务'],['queue','队列'],['event','事件与恢复']] as const){
   const tasksInGroup=tasks.filter(task=>task.kind===kind);if(!tasksInGroup.length)continue
   let group=groups.get(kind)
   if(!group){group=node('section','','task-instance-group');group.append(node('h3',label));groups.set(kind,group);list.append(group)}
   for(const task of tasksInGroup){
    let view=cards.get(task.key)
    if(!view){
     const card=node('section','','stellar-setting-card task-merged-card'),heading=node('header','','task-merged-heading'),title=node('h3',task.name),identity=node('div','','task-identity'),result=node('span','','task-heading-status'),description=node('p','','task-description'),logs=node('button',task.hasQueue?'日志 / 队列':'执行日志'),summary=node('dl','','task-instance-summary')
     card.dataset.task=task.key;logs.type='button';logs.className='task-detail-button';logs.onclick=()=>select(task.key);identity.append(title,result);const actions=node('div','','task-heading-actions'),retry=node('button','重试');retry.type='button';retry.className='task-detail-button';retry.hidden=true;retry.onclick=()=>void retryTask(task.key,retry);actions.append(retry,logs);heading.append(identity,actions);card.append(heading,description,summary)
     const entry=(label:string)=>{const row=node('div'),name=node('dt',label),value=node('dd');row.append(name,value);summary.append(row);return value}
     view={card,retry,schedule:entry('执行安排'),time:entry('上次运行'),result,error:entry('错误'),queue:entry('剩余项目')};cards.set(task.key,view);group.append(card)
     const period=task.periodKey||task.key
     const keys=[`tasks.${period}Seconds`]
     if(task.key==='video-sync')keys.push('tasks.video-retrySeconds')
     if(task.key==='friends-refresh')keys.push('tasks.friendsEveryDays','tasks.friendsTime')
     if(task.key==='friend-jobs')keys.push('tasks.friend-retrySeconds','tasks.friend-retry-maxSeconds')
     if(task.key==='attendance-refresh')keys.push('tasks.attendance-quietSeconds')
     if(task.key==='video-index')keys.push('tasks.video-index-retrySeconds')
     attachSettings(card,keys)
     const primary=settings.get(`tasks.${period}Seconds`)
     if(primary&&primary.parentElement===card){
      const help=primary.querySelector('small');description.textContent=help?.textContent||''
      primary.classList.add('task-primary-setting');const label=primary.querySelector('label');if(label)label.textContent=task.kind==='event'?'失败后重试等待':'执行间隔'
     }
     description.hidden=!description.textContent
    }
    view.retry.hidden=!task.retryable;view.schedule.textContent=task.kind==='event'?`启动时初始化；${task.schedule}`:task.schedule;view.time.textContent=date(task.lastRun?.startedAt||'')
    view.result.replaceChildren(badge(task.lastRun?.status||''));view.error.textContent=task.lastRun?.error||'—'
    view.error.parentElement!.hidden=!task.lastRun?.error;view.queue.parentElement!.hidden=!task.hasQueue;view.error.className='task-error';view.queue.textContent=task.hasQueue?`${task.remaining}（等待 ${task.waiting} · 执行中 ${task.running}）`:'—'
   }
  }
  const remaining=[...settings.keys()].filter(key=>!assigned.has(key))
  if(remaining.length){const shared=node('section','','stellar-setting-card task-shared-settings');shared.append(node('h3','共用配置'));attachSettings(shared,remaining);list.append(shared)}
 }
 const renderDetail=(value:Detail)=>{
  detail.replaceChildren();const top=node('header','','task-detail-heading'),title=node('h3',`${value.task.name} · 执行日志`),close=node('button','关闭');close.type='button';close.className='task-detail-button';close.onclick=()=>dialog.close();const actions=node('div','','task-heading-actions');if(value.task.retryable){const retry=node('button','重试');retry.type='button';retry.className='task-detail-button';retry.onclick=()=>void retryTask(value.task.key,retry);actions.append(retry)}actions.append(close);top.append(title,actions);detail.append(top)
  if(value.task.hasQueue){
   const queue=node('section'),title=node('h4',`队列项目 · ${value.queue.total}`),{wrap,body}=table(['项目','状态','失败次数','下次可执行','错误']);queue.append(title,wrap);detail.append(queue)
   if(!value.queue.items.length){const row=node('tr'),td=cell(row,'当前队列为空');td.setAttribute('colspan','5');body.append(row)}
   for(const item of value.queue.items){const row=node('tr');const label=cell(row,item.label,'task-name');label.title=item.id;const state=cell(row,'');state.append(badge(item.state));cell(row,String(item.attempts));cell(row,date(item.availableAt),'task-time');cell(row,item.error||'—','task-error');body.append(row)}
   const pagination=node('nav','','task-pagination');renderAdminPagination(pagination,value.queue.page,value.queue.pages,value.queue.total,next=>{page=next;version++;detailBusy=false;void loadDetail()});queue.append(pagination)
  }
  const history=node('section','','task-run-history');history.append(node('h4',`最近 ${value.runs.length} 次执行`));detail.append(history)
  if(!value.runs.length)history.append(node('p','尚无执行记录。'))
  for(const run of value.runs){
   const record=node('details','','task-run-record'),summary=node('summary');record.open=opened.has(run.id);record.addEventListener('toggle',()=>{if(!record.isConnected)return;if(record.open)opened.add(run.id);else opened.delete(run.id)})
   summary.append(node('time',date(run.startedAt)),badge(run.status),node('span',run.status==='running'?'正在执行':run.status==='interrupted'?'执行中断':duration(run.durationMs),'task-run-duration'))
   const meta=node('p',`结束时间：${date(run.finishedAt)}`,'task-run-meta');record.append(summary,meta)
   if(run.error)record.append(node('p',run.error,'task-error'))
   record.append(node('pre',run.logs||'暂无详细日志','task-run-log'));history.append(record)
  }
 }
 const load=async()=>{
  if(busy||signal.aborted)return;busy=true;refresh.disabled=true
  try{const data:{tasks:Task[]}=await request('/admin/tasks');if(signal.aborted)return;state.hidden=true;lastError='';renderList(data.tasks);if(selected&&dialog.open)await loadDetail()}
  catch(error){if(signal.aborted)return;const message=error instanceof Error?error.message:'任务读取失败';state.textContent=message;state.hidden=false;if(lastError!==message){showPasswordToast(message,true);lastError=message}}
  finally{busy=false;refresh.disabled=false}
 }
 refresh.onclick=()=>void load();const timer=setInterval(()=>{if(!document.hidden&&!root.closest('[hidden]')&&(!root.closest('dialog')||(root.closest('dialog') as HTMLDialogElement).open))void load()},5000)
 signal.addEventListener('abort',()=>{version++;clearInterval(timer);if(dialog.open)dialog.close();dialog.remove()},{once:true})
 void load();return ()=>void load()
}
