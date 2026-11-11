import {showPasswordToast} from './passwordFeedback'
import { navigationIcon, navigationIconSource } from './navigationIcon'
type Link={label:string;href:string;icon:string;order:number}
const fixed=(href:string)=>/^\/(friends|observatory)\/?(?:[?#].*)?$/.test(href)
export function setupNavigationManager(root:HTMLElement,raw:unknown,save:(value:string)=>Promise<void>,kind='寻径链接'){
 let links:Link[]=[];try{links=JSON.parse(String(raw||'[]')).filter((row:Link)=>!fixed(row.href))}catch{}
 let editing:Link|undefined,draft:Link|undefined,busy=false
 const add=document.createElement('button'),list=document.createElement('div')
 add.type='button';add.className='stellar-navigation-add';add.setAttribute('aria-label','添加链接');add.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>添加链接</span>';list.className='stellar-navigation-list';root.append(list)
 const draw=()=>{
  list.replaceChildren();add.disabled=busy
  for(const item of [...links,...(draft?[draft]:[])].sort((a,b)=>a.order-b.order)){
   const section=document.createElement('section'),summary=document.createElement('div'),mark=document.createElement('span'),copy=document.createElement('div'),name=document.createElement('strong'),address=document.createElement('span'),orderLabel=document.createElement('small'),edit=document.createElement('button')
   section.className='stellar-navigation-item';summary.className='stellar-navigation-summary';mark.className='stellar-navigation-icon';mark.innerHTML=navigationIcon(item.icon);mark.setAttribute('aria-hidden','true');copy.className='stellar-navigation-copy';name.textContent=item.label||'新链接';address.textContent=item.href||'填写网站地址';copy.append(name,address);orderLabel.textContent=String(item.order);orderLabel.title='排序，数值越小越靠前';edit.type='button';edit.textContent=editing===item?'收起':'编辑';edit.disabled=busy;edit.setAttribute('aria-expanded',String(editing===item));edit.onclick=()=>{editing=editing===item?undefined:item;draw()};summary.append(mark,copy,orderLabel,edit);section.append(summary);list.append(section)
   if(editing!==item)continue
   const form=document.createElement('form');form.className='stellar-navigation-editor'
   const input=(title:string,value:string,key:string,type='text')=>{const label=document.createElement('label'),name=document.createElement('span'),field=document.createElement('input');label.className='stellar-navigation-field field-'+key;name.textContent=title;field.type=type;field.value=value;field.required=true;field.disabled=busy;if(type==='text')field.maxLength=key==='name'?80:1000;label.append(name,field);form.append(label);return field}
   const label=input('名称',item.label,'name'),order=input('排序',String(item.order),'order','number'),href=input('链接地址',item.href,'address'),iconLabel=document.createElement('label'),iconName=document.createElement('span'),icon=document.createElement('textarea');href.placeholder='https://';order.step='1';iconLabel.className='stellar-navigation-field field-icon';iconName.textContent='图标 SVG 代码'
   icon.value=navigationIconSource(item.icon);icon.className='svg-icon-code';icon.rows=5;icon.maxLength=16384;icon.spellcheck=false;icon.setAttribute('aria-label','图标 SVG 代码');icon.placeholder='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">...</svg>';icon.disabled=busy;iconLabel.append(iconName,icon);form.append(iconLabel);icon.addEventListener('input',()=>{mark.innerHTML=navigationIcon(icon.value)})
   const actions=document.createElement('div'),submit=document.createElement('button'),remove=document.createElement('button'),status=document.createElement('span');actions.className='stellar-navigation-actions';status.setAttribute('role','status');submit.type='submit';submit.className='stellar-navigation-save';submit.textContent='保存';remove.type='button';remove.textContent=draft===item?'取消':'删除';submit.disabled=remove.disabled=busy;actions.append(status,remove,submit);form.append(actions);section.append(form)
   const persist=async(next:Link[])=>{busy=true;add.disabled=submit.disabled=remove.disabled=edit.disabled=true;for(const field of form.querySelectorAll('input,select,textarea'))(field as HTMLInputElement).disabled=true;status.textContent='';try{await save(JSON.stringify(next));links=next;editing=draft=undefined;busy=false;showPasswordToast(`${kind}已保存`);draw()}catch(error){showPasswordToast(error instanceof Error?error.message:'保存失败',true)}finally{busy=false;add.disabled=submit.disabled=remove.disabled=edit.disabled=false;for(const field of form.querySelectorAll('input,select,textarea'))(field as HTMLInputElement).disabled=false}}
   form.onsubmit=event=>{event.preventDefault();if(busy)return;const updated={label:label.value.trim(),href:href.value.trim(),icon:icon.value.trim(),order:Number(order.value)};if(updated.icon&&!navigationIcon(updated.icon)){showPasswordToast('请填写完整的 SVG 代码，不支持脚本、style 或外部资源',true);return}if(fixed(updated.href)){showPasswordToast('友链和星枢为固定入口',true);return}void persist(draft===item?[...links,updated]:links.map(row=>row===item?updated:row))}
   remove.onclick=()=>{if(draft===item){draft=editing=undefined;draw()}else void persist(links.filter(row=>row!==item))}
  }
  list.append(add)
 }
 add.onclick=()=>{draft={label:'',href:'',icon:'',order:Math.max(0,...links.map(row=>row.order))+10};editing=draft;draw()};draw()
}
