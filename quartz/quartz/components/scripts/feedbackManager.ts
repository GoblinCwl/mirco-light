import {renderAdminPagination} from "./adminPagination"
import {showAdminListLoading,showAdminListMessage} from './adminListState'
import {node} from './driveUi'
import {showPasswordToast} from './passwordFeedback'

type Feedback={id:string;email:string;browser:string;description:string;status:string;createdAt:string}
export function setupFeedbackManager(root:HTMLElement,signal:AbortSignal,request:(path:string,init?:RequestInit)=>Promise<any>){
 let page=1,busy=false,mutating=false
 const load=async(next=page)=>{
  if(busy||mutating||signal.aborted)return
  busy=true;root.setAttribute('aria-busy','true')
  if(!root.querySelector('.feedback-admin-list'))showAdminListLoading(root)
  try{
   const result:{page:number;items:Feedback[];total:number}=await request(`/admin/data/feedback?page=${next}`);if(signal.aborted)return
   page=result.page
   const heading=node('div','','friend-admin-heading'),refresh=node('button','刷新');refresh.type='button';refresh.onclick=()=>void load();heading.append(node('span',`共 ${result.total} 条反馈`),refresh)
   const list=node('div','','feedback-admin-list')
   if(!result.items.length)showAdminListMessage(list,'暂无问题反馈','访客提交的反馈会显示在这里。')
   for(const item of result.items){
    const card=node('section','','feedback-admin-item'),header=node('header'),email=node('a',item.email),status=node('button',item.status==='待处理'?'标记已解决':'重新打开')
    email.href=`mailto:${item.email}`;email.dataset.noPopover='true';status.type='button'
    const meta=node('p',`${item.browser} · ${new Date(item.createdAt).toLocaleString('zh-CN')}`,'feedback-admin-meta'),description=node('p',item.description,'feedback-admin-description')
    const actions=node('div','','feedback-admin-actions'),remove=node('button','删除');remove.type='button';remove.className='is-danger';actions.append(status,remove)
    const state=node('span',item.status,'feedback-admin-state stellar-admin-badge');state.dataset.state=item.status;header.append(email,state,actions);card.append(header,meta,description);list.append(card)
    const perform=async(init:RequestInit)=>{
     if(busy||mutating||signal.aborted)return
     mutating=true;const controls=[...root.querySelectorAll<HTMLButtonElement>('button')],disabled=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true)
     try{await request(`/admin/data/feedback/${item.id}`,init);mutating=false;await load()}
     catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'操作失败',true)}
     finally{mutating=false;controls.forEach((control,i)=>control.disabled=disabled[i])}
    }
    status.onclick=()=>void perform({method:'PUT',body:JSON.stringify({status:item.status==='待处理'?'已解决':'待处理'})})
    let confirming=false
    remove.onclick=()=>{if(busy||mutating)return;if(!confirming){confirming=true;remove.textContent='确认删除';return}void perform({method:'DELETE'})}
   }
   const footer=node('div','','stellar-admin-pagination');renderAdminPagination(footer,page,Math.max(1,Math.ceil(result.total/30)),result.total,value=>void load(value))
   root.replaceChildren(heading,list,...(result.items.length?[footer]:[]))
  }catch(error){if(!signal.aborted){if(!root.querySelector('.feedback-admin-list'))showAdminListMessage(root,'问题反馈加载失败',error instanceof Error?error.message:'请稍后重试。',()=>void load());else showPasswordToast(error instanceof Error?error.message:'读取反馈失败',true)}}
  finally{busy=false;root.removeAttribute('aria-busy')}
 }
 void load()
}
