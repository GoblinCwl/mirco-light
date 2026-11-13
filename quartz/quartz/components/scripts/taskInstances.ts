import {node} from './driveUi'
import {showPasswordToast} from './passwordFeedback'
import {renderAdminPagination} from './adminPagination'
type Run={id:number;startedAt:string;finishedAt:string;status:string;durationMs:number;error:string;logs:string}
type Task={key:string;name:string;kind:string;hasQueue:boolean;schedule:string;lastRun:Run|null;remaining:number;waiting:number;running:number}
type Item={id:string;label:string;state:string;attempts:number;availableAt:string;error:string}
type Detail={task:Task;runs:Run[];queue:{items:Item[];total:number;waiting:number;running:number;page:number;pages:number}}
const status:Record<string,string>={success:'成功',failed:'失败',running:'执行中',interrupted:'已中断',pending:'等待执行',retry:'等待重试'}
const date=(value:string)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—'
const duration=(ms:number)=>ms<1000?`${ms} 毫秒`:`${(ms/1000).toFixed(1)} 秒`
const badge=(value:string)=>{const el=node('span',status[value]||'尚未运行','task-run-status');el.dataset.status=value;return el}
export function setupTaskInstances(root:HTMLElement,signal:AbortSignal,request:(path:string)=>Promise<any>){
 let selected='',page=1,busy=false,detailBusy=false,version=0,lastError='',opened=new Set<number>()
 const toolbar=node('div','','task-instance-toolbar'),hint=node('span','执行时间均为北京时间，保留每个任务最近 10 次执行记录。'),refresh=node('button','刷新'),state=node('p','正在读取任务实例…','task-instance-state'),list=node('div','','task-instance-list'),detail=node('section','','task-instance-detail')
 refresh.type='button';refresh.className='stellar-action-button';toolbar.append(hint,refresh);detail.hidden=true;root.append(toolbar,state,list,detail)
 const cell=(row:HTMLElement,text:string,className='')=>{const td=node('td',text,className);row.append(td);return td}
 const table=(heads:string[])=>{const wrap=node('div','','task-table-wrap'),table=node('table','','task-table'),head=node('thead'),row=node('tr'),body=node('tbody');for(const title of heads){const th=node('th',title);th.scope='col';row.append(th)};head.append(row);table.append(head,body);wrap.append(table);return {wrap,body}}
 const loadDetail=async()=>{
  if(!selected||detailBusy||signal.aborted)return
  detailBusy=true;const key=selected,own=++version
  try{const value:Detail=await request(`/admin/tasks/${encodeURIComponent(key)}?page=${page}`);if(signal.aborted||own!==version||key!==selected)return;page=value.queue.page;renderDetail(value)}
  catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'任务详情读取失败',true)}finally{detailBusy=false}
 }
 const select=(key:string)=>{selected=key;page=1;opened.clear();version++;detailBusy=false;detail.hidden=false;detail.replaceChildren(node('p','正在读取执行记录…'));void loadDetail()}
 const renderList=(tasks:Task[])=>{
  list.replaceChildren()
  for(const [kind,label] of [['periodic','周期任务'],['queue','队列'],['event','事件与恢复']] as const){
   const group=tasks.filter(task=>task.kind===kind);if(!group.length)continue
   const section=node('section','','stellar-setting-card task-instance-group'),heading=node('h3',label),{wrap,body}=table(['任务','执行安排','上次运行','结果','错误','剩余项目',''])
   section.append(heading,wrap);list.append(section)
   for(const task of group){
    const row=node('tr');row.dataset.selected=String(task.key===selected);cell(row,task.name,'task-name');cell(row,task.schedule,'task-schedule');cell(row,date(task.lastRun?.startedAt||''),'task-time');const result=cell(row,'');result.append(badge(task.lastRun?.status||''));cell(row,task.lastRun?.error||'—','task-error')
    const count=cell(row,task.hasQueue?String(task.remaining):'—','task-remaining');if(task.hasQueue)count.title=`等待 ${task.waiting}，执行中 ${task.running}`
    const action=cell(row,''),button=node('button',task.hasQueue?'日志 / 队列':'执行日志');button.type='button';button.className='task-detail-button';button.onclick=()=>select(task.key);action.append(button);body.append(row)
   }
  }
 }
 const renderDetail=(value:Detail)=>{
  detail.hidden=false;detail.replaceChildren();const top=node('header','','task-detail-heading'),title=node('h3',value.task.name),close=node('button','关闭');close.type='button';close.className='task-detail-button';close.onclick=()=>{selected='';version++;detail.hidden=true};top.append(title,close);detail.append(top)
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
  try{const data:{tasks:Task[]}=await request('/admin/tasks');if(signal.aborted)return;state.hidden=true;lastError='';renderList(data.tasks);if(selected)await loadDetail()}
  catch(error){if(signal.aborted)return;const message=error instanceof Error?error.message:'任务实例读取失败';state.textContent=message;state.hidden=false;if(lastError!==message){showPasswordToast(message,true);lastError=message}}
  finally{busy=false;refresh.disabled=false}
 }
 refresh.onclick=()=>void load();const timer=setInterval(()=>{if(!document.hidden&&!root.closest('[hidden]')&&(!root.closest('dialog')||(root.closest('dialog') as HTMLDialogElement).open))void load()},5000);signal.addEventListener('abort',()=>{version++;clearInterval(timer)},{once:true});void load();return ()=>void load()
}
