import { showPasswordToast } from './passwordFeedback'

document.addEventListener('nav',()=>{
 const root=document.querySelector<HTMLElement>('[data-feedback]');if(!root)return
 const form=root.querySelector<HTMLFormElement>('form')!,email=form.elements.namedItem('email') as HTMLInputElement,browser=form.elements.namedItem('browser') as HTMLInputElement,description=form.elements.namedItem('description') as HTMLTextAreaElement,submit=form.querySelector<HTMLButtonElement>('button')!,label=submit.querySelector('span')!,count=root.querySelector<HTMLOutputElement>('output')!
 const controller=new AbortController(),signal=controller.signal;window.addCleanup(()=>controller.abort())
 const dialog=root.closest<HTMLDialogElement>('dialog')
 const toast=(message:string,error=false)=>{
  showPasswordToast(message,error)
  const notice=document.querySelector('.decrypt-toast')
  if(notice)(dialog?.matches(':modal')?dialog:document.body).append(notice)
 }
 const releaseToast=()=>{const notice=dialog?.querySelector('.decrypt-toast');if(notice){notice.classList.remove('visible');document.body.append(notice)}}
 dialog?.addEventListener('close',releaseToast,{signal});window.addCleanup(releaseToast)
 const ua=navigator.userAgent
 const candidates:[string,RegExp][]=[['微信',/MicroMessenger\/([\d.]+)/],['Edge',/Edg(?:e|A|iOS)?\/([\d.]+)/],['Opera',/(?:OPR|Opera)\/([\d.]+)/],['Firefox',/(?:Firefox|FxiOS)\/([\d.]+)/],['Chrome',/(?:Chrome|CriOS)\/([\d.]+)/],['Safari',/Version\/([\d.]+).*Safari/]]
 const found=candidates.map(([name,pattern])=>({name,version:pattern.exec(ua)?.[1]})).find(item=>item.version)
 const os=/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'iPadOS':/iPhone|iPod/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':''
 browser.value=[found?`${found.name} ${found.version}`:'其他浏览器',os].filter(Boolean).join(' · ')
 let busy=false
 const sync=()=>{submit.disabled=busy||!email.value.trim()||!description.value.trim();count.value=`${description.value.length} / 2000`}
 for(const field of [email,description])field.addEventListener('input',()=>{field.removeAttribute('aria-invalid');sync()},{signal})
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||submit.disabled)return
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())){email.setAttribute('aria-invalid','true');toast('请输入有效的邮箱地址',true);if(!matchMedia('(max-width:1199px)').matches)email.focus();return}
  busy=true;form.setAttribute('aria-busy','true');label.textContent='提交中…';sync()
  try{
   const response=await fetch('/api/site/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value.trim(),browser:browser.value,description:description.value.trim()}),signal})
   const result=await response.json();if(!response.ok)throw new Error(result.error||'提交失败，请稍后重试')
   email.value='';description.value='';toast('问题反馈已提交。')
  }catch(error){if(!signal.aborted)toast(error instanceof Error?error.message:'提交失败，请稍后重试',true)}
  finally{if(!signal.aborted){busy=false;form.removeAttribute('aria-busy');label.textContent='提交反馈';sync()}}
 },{signal})
 sync()
})
