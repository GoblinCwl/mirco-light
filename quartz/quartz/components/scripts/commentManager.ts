import { node } from './driveUi'
import { driveActionDialog } from './driveActionDialog'
import { renderAdminPagination } from './adminPagination'
import { showAdminListLoading, showAdminListMessage } from './adminListState'
import { showPasswordToast } from './passwordFeedback'
import { bindIdenticon } from './identicon'
import { commentContent } from './commentContent'

type Request = (path: string, init?: RequestInit) => Promise<any>
type Comment = { id:number; nick:string; content:string; content_marked?:string; date:string; page_key:string; page_url?:string; rid:number; is_pending:boolean; is_pinned:boolean; is_collapsed:boolean; avatarSeed?:string; isAdmin?:boolean }
type User = { id:number; name:string; email:string; link:string; is_admin:boolean; receive_email:boolean; badge_name:string; badge_color:string; protected:boolean; avatarSeed?:string }
const button = (title:string, action:()=>void) => { const el=node('button',title);el.type='button';el.onclick=action;return el }

export function setupCommentManager(root:HTMLElement, signal:AbortSignal, request:Request) {
 let kind:'comments'|'users'='comments',page=1,revision=0,mutating=false
 const editorHost=node('div');editorHost.hidden=true
 const tabs=node('div','','data-admin-tabs'),toolbar=node('form','','comment-admin-toolbar'),search=node('input'),filter=node('select'),list=node('div','','comment-admin-list'),footer=node('div','','stellar-admin-pagination')
 search.type='search';search.placeholder='搜索评论内容、昵称或邮箱';search.setAttribute('aria-label','搜索评论或用户')
 filter.setAttribute('aria-label','筛选评论或用户')
 const commentTab=button('评论',()=>select('comments')),userTab=button('用户',()=>select('users')),query=button('搜索',()=>void load(1)),refresh=button('刷新',()=>void load()),create=button('新增用户',()=>editUser())
 query.type='submit';query.onclick=null;tabs.append(commentTab,userTab);toolbar.append(search,filter,query,refresh,create);root.append(tabs,toolbar,list,footer,editorHost)
 const closeEditor=()=>{editorHost.hidden=true;editorHost.replaceChildren();for(const el of [tabs,toolbar,list,footer])el.hidden=false}
 const editForm=(title:string)=>{
  const form=node('form','','friend-admin-form'),heading=node('header','','friend-admin-heading'),back=button('返回列表',()=>{if(!mutating)closeEditor()}),fields=node('div','','friend-admin-fields'),actions=node('div','','friend-admin-footer'),submit=node('button','保存')
  submit.type='submit';submit.className='friend-admin-submit';heading.append(node('h3',title),back);actions.append(submit);form.append(heading,fields,actions)
  for(const el of [tabs,toolbar,list,footer])el.hidden=true
  editorHost.replaceChildren(form);editorHost.hidden=false
  return {
   body:fields,submit,
   field(label:string,value='',type='text'){const wrapper=node('label',label),input=node('input');input.type=type;input.value=value;wrapper.append(input);fields.append(wrapper);return input},
   note(text:string){const note=node('p',text,'data-admin-note is-wide');fields.append(note)},
   run(action:()=>Promise<void>){form.onsubmit=async event=>{event.preventDefault();if(mutating||!form.reportValidity())return;const controls=[...form.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLTextAreaElement>('input,button,textarea')];controls.forEach(el=>el.disabled=true);try{await action();if(!signal.aborted){closeEditor();showPasswordToast('已保存')}}catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'保存失败',true)}finally{controls.forEach(el=>el.disabled=false)}}}
  }
 }
 const avatar=(name:string,seed?:string,admin=false)=>{
  const host=node('span','','comment-admin-avatar'),image=node('img');image.alt='';image.width=image.height=40;image.loading='lazy';image.referrerPolicy='no-referrer';bindIdenticon(image,name,seed||name,admin);host.append(image);return host
 }
 toolbar.onsubmit=event=>{event.preventDefault();void load(1)}
 filter.onchange=()=>void load(1)
 const endpoint=(id?:number)=>`/admin/comments/${kind}${id===undefined?'':`/${id}`}`
 const notify=()=>document.dispatchEvent(new CustomEvent('comments-admin-changed'))
 const mutate=async(path:string,init:RequestInit)=>{
  if(mutating)throw Error('操作正在处理中')
  mutating=true;root.setAttribute('aria-busy','true')
  try{await request(path,init);notify()}finally{mutating=false;root.removeAttribute('aria-busy')}
  await load()
 }
 const remove=(item:Comment|User)=>{
  const users=kind==='users',path=endpoint(item.id),dialog=driveActionDialog(users?'删除用户':'删除评论',signal)
  dialog.note(users?`确认永久删除用户「${(item as User).name}」？Artalk 关联数据也可能受影响。`:'确认永久删除这条评论？此操作无法撤销。')
  dialog.submit.textContent='确认删除';dialog.submit.classList.add('is-danger')
  dialog.run(()=>mutate(path,{method:'DELETE'}))
 }
 const editComment=(item:Comment)=>{
  const dialog=editForm('编辑评论'),label=node('label','正文','is-wide'),content=node('textarea')
  content.value=item.content;content.required=true;content.rows=10;content.maxLength=50000;label.append(content);dialog.body.append(label)
  dialog.note(`作者：${item.nick} · 页面：${item.page_key}`)
  dialog.run(()=>mutate(`/admin/comments/comments/${item.id}`,{method:'PUT',body:JSON.stringify({content:content.value})}))
 }
 const editUser=(item?:User)=>{
  const dialog=editForm(item?'编辑用户':'新增用户')
  const name=dialog.field('昵称',item?.name||''),email=dialog.field('邮箱',item?.email||'','email'),link=dialog.field('网址',item?.link||'','url'),badge=dialog.field('徽章文字',item?.badge_name||''),color=dialog.field('徽章颜色',item?.badge_color||''),password=dialog.field(item?'重设密码（留空保持原密码）':'密码（可选）','','password')
  name.required=email.required=true;name.maxLength=200;email.maxLength=320;password.autocomplete='new-password';password.minLength=12
  const checkbox=(title:string,checked:boolean)=>{const label=node('label','','comment-admin-checkbox'),input=node('input');input.type='checkbox';input.setAttribute('role','switch');input.checked=checked;label.append(input,node('span',title));dialog.body.append(label);return input}
  const admin=checkbox('管理员',item?.is_admin||false),receive=checkbox('接收邮件通知',item?.receive_email??true)
  dialog.note('重设密码至少 12 个字符。本站同步管理员账号在服务接入中管理。')
  dialog.run(()=>mutate(`/admin/comments/users${item?`/${item.id}`:''}`,{method:item?'PUT':'POST',body:JSON.stringify({name:name.value,email:email.value,link:link.value,badge_name:badge.value,badge_color:color.value,password:password.value,is_admin:admin.checked,receive_email:receive.checked})}))
 }
 const toggle=(item:Comment,key:'is_pending'|'is_pinned'|'is_collapsed')=>{
  if(mutating)return
  void mutate(`/admin/comments/comments/${item.id}`,{method:'PUT',body:JSON.stringify({[key]:!item[key]})}).catch(error=>{if(!signal.aborted)showPasswordToast(error.message,true)})
 }
 const renderComments=(items:Comment[])=>{
  for(const item of items){
   const card=node('section','','comment-admin-card'),header=node('header'),title=node('strong',item.nick||'匿名用户'),meta=node('p',`#${item.id} · ${item.date} · ${item.page_key}${item.rid?` · 回复 #${item.rid}`:''}`,'comment-admin-meta'),text=node('div','','comment-admin-body'),actions=node('div','','comment-admin-actions'),states=node('span',[item.is_pending?'待审核':'已通过',item.is_pinned?'置顶':'',item.is_collapsed?'折叠':''].filter(Boolean).join(' · '),'stellar-admin-badge')
   text.append(commentContent(item.content_marked||item.content));title.classList.toggle('comment-admin-name',!!item.isAdmin)
   const author=node('div','','comment-admin-author'),copy=node('div','','comment-admin-author-copy');copy.append(title,states);author.append(avatar(item.nick,item.avatarSeed,item.isAdmin),copy);header.append(author,actions)
   const del=button('删除',()=>remove(item));del.className='is-danger'
   try {
    const raw=item.page_url||item.page_key
    const url=new URL(raw.startsWith('/')||/^https?:\/\//i.test(raw)?raw:`/${raw}`,location.origin)
    if(url.origin===location.origin&&!url.username&&!url.password){
     url.hash=`atk-comment-${item.id}`
     const article=node('a','查看文章','comment-admin-article-link');article.href=url.href;article.target='_blank';article.rel='noopener noreferrer';article.dataset.noPopover='true';article.dataset.routerIgnore='true';actions.append(article)
    }
   } catch { /* Invalid upstream page addresses do not produce navigation links. */ }
   actions.append(button('编辑',()=>editComment(item)),button(item.is_pending?'通过审核':'设为待审核',()=>toggle(item,'is_pending')),button(item.is_pinned?'取消置顶':'置顶',()=>toggle(item,'is_pinned')),button(item.is_collapsed?'展开':'折叠',()=>toggle(item,'is_collapsed')),del)
   card.append(header,meta,text);list.append(card)
  }
 }
 const renderUsers=(items:User[])=>{
  for(const item of items){
   const card=node('section','','comment-admin-card'),header=node('header'),title=node('strong',item.name),role=node('span',item.is_admin?'管理员':'普通用户','stellar-admin-badge'),meta=node('p',`#${item.id} · ${item.email}${item.badge_name?` · ${item.badge_name}`:''}`,'comment-admin-meta'),actions=node('div','','comment-admin-actions'),edit=button('编辑',()=>editUser(item)),del=button('删除',()=>remove(item))
   const author=node('div','','comment-admin-author'),copy=node('div','','comment-admin-author-copy');copy.append(title,role);author.append(avatar(item.name,item.avatarSeed,item.is_admin),copy);header.append(author,actions);edit.disabled=del.disabled=!!item.protected;del.className='is-danger';actions.append(edit,del)
   card.append(header,meta,node('p',item.link||'未填写网址','comment-admin-meta'))
   if(item.protected)card.append(node('p','本站同步管理员 · 受保护','comment-admin-meta'))
   list.append(card)
  }
 }
 const load=async(next=page)=>{
  if(signal.aborted||mutating)return
  const own=++revision,current=kind;root.setAttribute('aria-busy','true');showAdminListLoading(list);footer.replaceChildren()
  const params=new URLSearchParams({page:String(next),search:search.value.trim(),filter:filter.value})
  try{
   const result=await request(`/admin/comments/${current}?${params}`)
   if(signal.aborted||own!==revision)return
   page=result.page;list.replaceChildren()
   if(!result.items.length)showAdminListMessage(list,'暂无匹配记录','尝试其他搜索词或筛选条件。')
   else if(current==='comments')renderComments(result.items);else renderUsers(result.items)
   renderAdminPagination(footer,page,Math.max(1,Math.ceil(result.total/result.pageSize)),result.total,value=>void load(value))
  }catch(error){if(!signal.aborted&&own===revision)showAdminListMessage(list,'加载失败',error instanceof Error?error.message:'请稍后重试',()=>void load(next))}
  finally{if(own===revision)root.removeAttribute('aria-busy')}
 }
 function select(value:'comments'|'users'){
  if(mutating)return
  kind=value;page=1;search.value='';commentTab.setAttribute('aria-pressed',String(kind==='comments'));userTab.setAttribute('aria-pressed',String(kind==='users'));create.hidden=kind!=='users'
  filter.replaceChildren()
  for(const [value,title] of kind==='comments'?[['all','全部评论'],['pending','待审核']]:[['all','全部用户'],['admin','管理员']]){const option=node('option',title);option.value=value;filter.append(option)}
  void load(1)
 }
 signal.addEventListener('abort',()=>{revision++},{once:true})
 select('comments')
}
