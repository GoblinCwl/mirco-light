import {waitForTagPublication} from './tagPublication'
import {readSiteSession} from './siteSession'
import {readContentCatalog} from './contentCatalog'
import {driveActionDialog} from './driveActionDialog'
import {node} from './driveUi'
import {showPasswordToast} from './passwordFeedback'
import {tagPrefixes} from './shareContent'
import {slugTag} from '../../util/path'
export function setupTagOperations(sidebar:HTMLElement,tag:string,signal:AbortSignal){
 sidebar.replaceChildren();sidebar.hidden=true;sidebar.removeAttribute('aria-busy')
 const section=node('div','','tag-project-operations');sidebar.append(section)
 let editing=false
 const edit=async(remove:boolean)=>{
  if(editing)return;editing=true
  try{
   const catalog=await readContentCatalog();if(signal.aborted)return
   const pages=Object.values(catalog.pages).filter(page=>tagPrefixes(page.tags).includes(slugTag(tag))===remove)
   const ui=driveActionDialog(remove?'移除项目':'添加项目',signal),search=node('input'),list=node('div','','tag-project-choices'),selected=new Set<string>()
   ui.dialog.addEventListener('close',()=>{editing=false},{once:true});search.type='search';search.placeholder='搜索项目标题';search.setAttribute('aria-label','搜索项目');ui.note(`标签：${tag}`);ui.body.append(search,list);ui.submit.disabled=true;ui.submit.textContent=remove?'移除':'添加'
   const render=()=>{const query=search.value.trim().toLocaleLowerCase();list.replaceChildren();for(const page of pages.filter(page=>page.title.toLocaleLowerCase().includes(query))){const label=node('label'),check=node('input'),copy=node('span',page.title),kind=node('small',({article:'文章',share:'分享',repo:'仓库',video:'视频'})[page.type]);check.type='checkbox';check.checked=selected.has(page.id);check.onchange=()=>{if(check.checked)selected.add(page.id);else selected.delete(page.id);ui.submit.disabled=!selected.size};label.append(check,copy,kind);list.append(label)}if(!list.children.length)list.append(node('p','没有可选项目','drive-action-note'))}
   search.addEventListener('input',render,{signal});render()
   ui.run(async()=>{if(!selected.size)throw Error('请选择项目');const response=await fetch('/api/site/admin/tag-members',{method:'POST',credentials:'same-origin',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({tag,ids:[...selected],action:remove?'remove':'add'})});const value=await response.json();if(!response.ok)throw Error(value.error||'操作失败');const articles=pages.filter(page=>selected.has(page.id)&&page.type==='article').map(page=>page.id)
    if(articles.length){ui.submit.textContent='正在更新文章…';await waitForTagPublication(articles,tag,remove,signal)}
    document.dispatchEvent(new CustomEvent('content-tags-changed'));showPasswordToast(remove?'已移除标签关联':'已添加项目')
    if(articles.length&&!signal.aborted)await window.spaNavigate(new URL(location.href),true)})
  }catch(error){editing=false;if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'读取失败',true)}
 }
 for(const remove of [false,true]){
  const label=remove?'移除项目':'添加项目',button=node('button','','tag-project-edit')
  button.type='button';button.setAttribute('aria-label',label);button.title=label
  button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5M7 9h3M7 13h3M7 17h6"/><circle cx="17.5" cy="6.5" r="5" fill="var(--light)"/><path d="M15 6.5h5${remove?'':'M17.5 4v5'}"/></svg>`
  button.addEventListener('click',()=>void edit(remove),{signal});section.append(button)
 }
 const show=(authenticated:boolean)=>{sidebar.hidden=!authenticated}
 document.addEventListener('stellar-auth-changed',event=>show(!!(event as CustomEvent).detail?.authenticated),{signal})
 void readSiteSession().then(value=>{if(!signal.aborted)show(!!value?.authenticated)}).catch(()=>{})
}
