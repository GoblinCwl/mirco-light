import { parseFriends, type FriendLink } from '../../util/friends.mjs'
import { node } from './driveUi'
import { setupDockedButton } from './dockedButton'
import { showSiteDialog, closeSiteDialog } from './siteDialog'
import { showPasswordToast } from './passwordFeedback'
import { RequestCache } from './sharedRequest'

const sitePostmark=(friend:FriendLink)=>{
 let hash=2166136261
 for(const char of `${friend.name.normalize('NFC')}|${new URL(friend.url).hostname}`)hash=Math.imul(hash^char.charCodeAt(0),16777619)
 hash>>>=0
 const motifs=[
  '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/>',
  '<path d="M16 3a9 9 0 1 0 5 14A9 9 0 0 1 16 3Z"/><circle cx="6" cy="5" r=".8" fill="currentColor" stroke="none"/>',
  '<path d="m2 19 7-13 5 9 3-5 5 9ZM6.5 11h5M3 21h18"/>',
  '<circle cx="15" cy="15" r="4"/><path d="M3 3q1 10 9 12M7 3q1 6 6 9M3 9q2 8 9 10"/>',
  '<path d="M5 20C1 9 9 4 20 4c0 12-6 18-15 16ZM5 20 16 8M9 15V9m0 6h6"/>',
  '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="12" ry="4" transform="rotate(-30 12 12)"/><circle cx="19" cy="4" r="1" fill="currentColor" stroke="none"/>',
  '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  '<path d="M12 4c-3 4-7 7-7 11a7 7 0 0 0 14 0c0-4-4-7-7-11ZM4 21h16M9 15q3 3 6 0"/>',
 ]
 const mark=node('span','','friend-postmark');mark.setAttribute('aria-hidden','true')
 mark.style.setProperty('--postmark-angle',`${(hash>>>8)%27-13}deg`)
 const dash=['1 2.4','3 1.8','7 2 1 2','2 2'][hash>>>4&3]
 mark.innerHTML=`<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="20" r="17" stroke-dasharray="${dash}"/><circle cx="20" cy="20" r="14.2" opacity=".55"/><g transform="translate(8 8)">${motifs[hash%motifs.length]}</g></svg>`
 return mark
}

document.addEventListener('nav', () => {
 const root=document.querySelector<HTMLElement>('[data-friends-page]');if(!root)return
 const controller=new AbortController(),signal=controller.signal
 const list=root.querySelector<HTMLElement>('[data-friends-list]')!
 const space=root.querySelector<HTMLElement>('[data-friends-deep-space]')
 if(space&&!space.childElementCount){
  const stars=document.createDocumentFragment()
  for(let i=0;i<48;i++){
   const star=node('i');star.style.left=`${6+(i*61.803398875)%88}%`;star.style.top=`${3+(i*37.719)%94}%`
   star.style.setProperty('--space-delay',`${-i*1.37}s`);star.style.setProperty('--space-duration',`${5+i%7}s`)
   if(i%9===0)star.classList.add('is-near')
   stars.append(star)
  }
  space.append(stars)
 }

 const sidebar=document.querySelector<HTMLDialogElement>('.friends-sidebar')
 const launch=document.querySelector<HTMLButtonElement>('[data-friends-panel-open]')
 const compact=matchMedia('(max-width:1199px)')
 if(sidebar&&launch){
  const dock=setupDockedButton(launch,compact,signal,()=> 'quartz-friends-launch-position:v1')
  const syncPanel=()=>{
   if(compact.matches){if(sidebar.open)sidebar.close()}
   else{if(sidebar.matches(':modal'))sidebar.close();sidebar.open=true}
   launch.setAttribute('aria-expanded','false');dock.place()
  }
  syncPanel();compact.addEventListener('change',syncPanel,{signal})
  launch.addEventListener('click',()=>{if(!compact.matches)return;showSiteDialog(sidebar);launch.setAttribute('aria-expanded','true')},{signal})
  sidebar.querySelector('[data-friends-panel-close]')?.addEventListener('click',()=>void closeSiteDialog(sidebar),{signal})
  sidebar.addEventListener('close',()=>{if(!sidebar.open)launch.setAttribute('aria-expanded','false')},{signal})
  sidebar.addEventListener('click',event=>{if(!compact.matches||event.target!==sidebar)return;const box=sidebar.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)void closeSiteDialog(sidebar)},{signal})
 }
 const confirmation=document.querySelector<HTMLDialogElement>('[data-friends-application-preview]')
 const infoDialog=document.querySelector<HTMLDialogElement>('[data-friends-info-dialog]')
 // Safari can scroll the root page through a native dialog, especially when
 // its contents fit or have reached an edge. Keep gestures inside the modal.
 let modalTouchY=0
 document.addEventListener('touchstart',event=>{if(event.touches.length===1)modalTouchY=event.touches[0].clientY},{signal,capture:true,passive:true})
 document.addEventListener('touchmove',event=>{
  const modal=[sidebar,infoDialog,confirmation].filter((dialog):dialog is HTMLDialogElement=>!!dialog&&dialog.matches(':modal')).at(-1)
  if(!modal||event.touches.length!==1)return
  const touch=event.touches[0],delta=touch.clientY-modalTouchY;modalTouchY=touch.clientY
  const box=modal.getBoundingClientRect()
  const inside=touch.clientX>=box.left&&touch.clientX<=box.right&&touch.clientY>=box.top&&touch.clientY<=box.bottom
  if(inside&&event.target instanceof Element&&modal.contains(event.target)){
   for(let target:Element|null=event.target;target;target=target.parentElement){
    if(target instanceof HTMLElement&&/(auto|scroll)/.test(getComputedStyle(target).overflowY)&&target.scrollHeight>target.clientHeight+1){
     if(delta>0&&target.scrollTop>0||delta<0&&target.scrollTop+target.clientHeight<target.scrollHeight-1)return
    }
    if(target===modal)break
   }
  }
  if(event.cancelable)event.preventDefault()
 },{signal,capture:true,passive:false})
 const applicationError=(message:string,error=true)=>{
  showPasswordToast(message,error)
  const toast=document.querySelector('.decrypt-toast')
  const target=infoDialog?.matches(':modal')?infoDialog:confirmation?.matches(':modal')?confirmation:sidebar?.matches(':modal')?sidebar:document.body
  if(toast)target.append(toast)
 }
 for(const dialog of [sidebar,confirmation,infoDialog])dialog?.addEventListener('close',()=>{
  const toast=dialog.querySelector('.decrypt-toast');if(toast){toast.classList.remove('visible');document.body.append(toast)}
 },{signal})
 sidebar?.querySelector('[data-friends-info-open]')?.addEventListener('click',()=>{
  if(!infoDialog)return
  const values:Record<string,string>={name:sidebar.querySelector('.friends-site-identity strong')?.textContent||'',url:sidebar.querySelector<HTMLAnchorElement>('.friends-site-identity a')?.href||'',avatar:sidebar.querySelector<HTMLElement>('[data-copy-label="头像地址"]')?.dataset.friendsCopy||'',description:sidebar.querySelector('.friends-site-description')?.textContent||'',rss:sidebar.dataset.friendsRss||new URL('/index.xml',location.origin).href}
  for(const field of infoDialog.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('[data-friends-info-field]'))field.value=values[field.dataset.friendsInfoField!]||''
  showSiteDialog(infoDialog)
 },{signal})
 infoDialog?.querySelector('[data-friends-info-close]')?.addEventListener('click',()=>infoDialog.close(),{signal})
 infoDialog?.addEventListener('submit',event=>event.preventDefault(),{signal})
 infoDialog?.querySelector('[data-friends-info-copy]')?.addEventListener('click',async()=>{
  const labels:Record<string,string>={name:'名称',url:'地址',avatar:'头像',rss:'RSS',description:'简介'}
  const information=[...infoDialog.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('[data-friends-info-field]')].map(field=>`${labels[field.dataset.friendsInfoField!]}：${field.value}`).join('\n')
  try{await navigator.clipboard.writeText(information);if(!signal.aborted)applicationError('本站信息已复制',false)}
  catch{if(!signal.aborted)applicationError('复制失败，请重试')}
 },{signal})
 infoDialog?.addEventListener('click',async event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('[data-friends-info-copy-field]');if(!button)return
  const field=[...infoDialog.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('[data-friends-info-field]')].find(field=>field.dataset.friendsInfoField===button.dataset.friendsInfoCopyField)
  if(!field)return
  try{await navigator.clipboard.writeText(field.value);if(!signal.aborted)showPasswordToast('已复制')}
  catch{if(!signal.aborted)showPasswordToast('复制失败，请重试',true)}
 },{signal})
 infoDialog?.addEventListener('click',event=>{if(event.target!==infoDialog)return;const box=infoDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)infoDialog.close()},{signal})
 window.addCleanup(()=>{if(infoDialog?.open)infoDialog.close()})
 let pendingApplication:FriendLink|undefined
 for(const button of confirmation?.querySelectorAll('[data-friends-confirm-cancel]')||[])button.addEventListener('click',()=>confirmation?.close(),{signal})
 confirmation?.addEventListener('click',event=>{if(event.target!==confirmation)return;const box=confirmation.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)confirmation.close()},{signal})
 let submittingApplication=false
 confirmation?.querySelector<HTMLButtonElement>('[data-friends-confirm-submit]')?.addEventListener('click',async()=>{
  if(confirmation.classList.contains('is-complete')){confirmation.close();if(compact.matches&&sidebar)void closeSiteDialog(sidebar);return}
  if(!pendingApplication||submittingApplication)return
  const submit=confirmation.querySelector<HTMLButtonElement>('[data-friends-confirm-submit]')!
  submittingApplication=true;submit.disabled=true;submit.textContent='正在提交…'
  try{
   const response=await fetch('/api/site/friends/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pendingApplication),signal})
   const result=await response.json()
   if(!response.ok)throw new Error(result.error||'提交失败，请稍后重试')
    confirmation.classList.add('is-complete')
   const message='友链申请提交成功，已进入后台处理队列。'
   const notice=confirmation.querySelector<HTMLElement>('[data-friends-review-notice]');if(notice){notice.textContent=message;notice.hidden=false}
   applicationError(message,false)
   submit.disabled=false;submit.textContent='完成';pendingApplication=undefined
   application?.reset();syncApplication()
   const counter=sidebar?.querySelector('[data-friends-description-count]');if(counter)counter.textContent='0 / 40'
  }catch(error){
   if(signal.aborted)return
   applicationError(error instanceof Error?error.message:'提交失败，请稍后重试')
   submit.disabled=false;submit.textContent='提交'
  }finally{submittingApplication=false}
 },{signal})
 const application=sidebar?.querySelector<HTMLFormElement>('[data-friends-apply-form]')
 const applicationComplete=()=>Boolean(application&&['name','url','backlinkUrl','avatar','description'].every(name=>(application.elements.namedItem(name) as HTMLInputElement).value.trim()))
 const syncApplication=()=>{const submit=application?.querySelector<HTMLButtonElement>('[data-friends-apply]');if(submit)submit.disabled=!applicationComplete();for(const input of application?.querySelectorAll('[aria-invalid]')||[])input.removeAttribute('aria-invalid')}
 application?.addEventListener('input',syncApplication,{signal});application?.addEventListener('change',syncApplication,{signal});syncApplication()

 application?.addEventListener('submit',event=>{
  event.preventDefault()
  const field=(name:string)=>application.elements.namedItem(name) as HTMLInputElement
  if(!applicationComplete()||submittingApplication)return
  const website=field('url'),avatarField=field('avatar'),backlinkField=field('backlinkUrl')
  const address=(input:HTMLInputElement)=>{const value=input.value.trim();if(!/^https:\/\//i.test(value))throw new Error();const url=new URL(value);if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw new Error();return url.href}
  const validated:string[]=[]
  for(const [input,label] of [[website,'网站地址'],[avatarField,'头像地址'],[backlinkField,'包含本站友链的页面地址']] as const){
   try{validated.push(address(input))}
   catch{
    input.setAttribute('aria-invalid','true')
    if(!compact.matches){input.focus();input.scrollIntoView({block:'nearest',inline:'nearest'})}
    applicationError(`${label}须为有效的 HTTPS 链接，以 https:// 开头。`)
    return
   }
  }
  const rssField=field('rssUrl')
  let rssUrl=''
  if(rssField.value.trim()){
   try{const rss=new URL(rssField.value.trim());if(!['http:','https:'].includes(rss.protocol)||!rss.hostname||rss.username||rss.password)throw new Error();rssUrl=rss.href}
   catch{rssField.setAttribute('aria-invalid','true');if(!compact.matches)rssField.focus();applicationError('请填写有效的 RSS 地址（HTTP 或 HTTPS），或留空。');return}
  }
  const [siteUrl,avatarUrl,backlinkUrl]=validated
  const friend:FriendLink={id:'application-preview',name:field('name').value.trim(),url:siteUrl,avatar:avatarUrl,backlinkUrl,rssUrl,description:Array.from(field('description').value.trim()).slice(0,40).join('')}
  const stage=confirmation?.querySelector<HTMLElement>('[data-friends-preview-card]')
  if(!stage||!confirmation)return
  const card=node('div','','friend-letter');card.setAttribute('role','img');card.setAttribute('aria-label',`${friend.name}的友链卡片预览`);card.style.setProperty('--letter-angle','-2deg')
  const paper=node('div','','friend-letter-paper'),edge=node('div','','friend-letter-edge'),stamp=node('div','','friend-stamp'),top=node('div','','friend-stamp-top')
  top.append(node('h3',friend.name),node('span','待分配','friend-letter-number'))
  const art=node('div','','friend-stamp-art'),avatar=node('span','','friend-letter-avatar')
  avatar.append(node('span',Array.from(friend.name)[0]))
  if(friend.avatar){
   const image=node('img');image.alt='';image.referrerPolicy='strict-origin-when-cross-origin';avatar.classList.add('is-loading')
   image.addEventListener('load',()=>{avatar.classList.remove('is-loading');avatar.classList.add('is-loaded')},{once:true,signal})
   image.addEventListener('error',()=>{avatar.classList.remove('is-loading');image.remove()},{once:true,signal})
   avatar.append(image);image.src=friend.avatar
  }
  art.append(avatar);stamp.append(top,art);edge.append(stamp)
  const caption=node('div','','friend-letter-caption'),destination=node('div','','friend-letter-destination')
  destination.append(node('span',new URL(friend.url).host.replace(/^www\./,'')),sitePostmark(friend));caption.append(destination);paper.append(edge,caption);card.append(paper)
  confirmation.classList.remove('is-complete')
  const notice=confirmation.querySelector<HTMLElement>('[data-friends-review-notice]');if(notice){notice.textContent='';notice.hidden=true}
  stage.replaceChildren(card);pendingApplication=friend
  const summary=confirmation.querySelector<HTMLElement>('[data-friends-preview-description]');if(summary)fillBubble(summary,friend.description)
  const submit=confirmation.querySelector<HTMLButtonElement>('[data-friends-confirm-submit]');if(submit){submit.disabled=false;submit.textContent='提交'}
  showSiteDialog(confirmation)
 },{signal})
 const description=sidebar?.querySelector<HTMLTextAreaElement>('[data-friends-description]')
 if(description){
  let composing=false
  const updateDescription=()=>{if(composing)return;description.value=Array.from(description.value).slice(0,40).join('');syncApplication();const counter=sidebar?.querySelector('[data-friends-description-count]');if(counter)counter.textContent=`${Array.from(description.value).length} / 40`}
  description.addEventListener('compositionstart',()=>{composing=true},{signal})
  description.addEventListener('compositionend',()=>{composing=false;updateDescription()},{signal})
  description.addEventListener('input',updateDescription,{signal})
 }
 sidebar?.addEventListener('click',async event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('[data-friends-copy]')
  const value=button?.dataset.friendsCopy
  if(!button||!value)return
  const status=sidebar?.querySelector<HTMLElement>('[data-friends-copy-status]');if(status)status.textContent=''
  try{await navigator.clipboard.writeText(value);if(!signal.aborted)showPasswordToast(`${button.dataset.copyLabel||'内容'}已复制`)}
  catch{if(!signal.aborted)showPasswordToast('复制失败，请重试',true)}
 },{signal})
 const reduced=matchMedia('(prefers-reduced-motion:reduce)')
 let friends:FriendLink[]=[],signature=''
 let locatedCard=''
 const locateCard=()=>{
  const url=new URL(location.href),value=url.searchParams.get('card')
  // Also accept a literal ?card=#003, where the browser puts #003 in the fragment.
  const requested=value===''&&url.searchParams.has('card')?url.hash:value
  const match=/^#?(\d+)$/.exec(requested||'')
  const number=match?Number(match[1]):0
  const key=number>0&&Number.isSafeInteger(number)?String(number).padStart(3,'0'):''
  const target=key?list.querySelector<HTMLAnchorElement>(`[data-card-number="${key}"]`):null
  for(const card of list.querySelectorAll('.friend-letter'))card.classList.toggle('is-linked-card',card===target)
  if(!target){locatedCard='';return}
  if(locatedCard===key)return
  locatedCard=key
  target.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'center',inline:'nearest'})
 }
 window.addEventListener('hashchange',locateCard,{signal});window.addEventListener('popstate',locateCard,{signal})

 let entrancePlayed=false,entrancePending=false
 const entranceAnimations=new Set<Animation>()
 const cardEntrances=new Map<HTMLAnchorElement,Animation>()
 const entranceAnimate=(element:Element,frames:Keyframe[],options:KeyframeAnimationOptions,done?:()=>void)=>{
  const animation=element.animate(frames,options);entranceAnimations.add(animation)
  void animation.finished.catch(()=>{}).finally(()=>{done?.();entranceAnimations.delete(animation);animation.cancel()})
  return animation
 }
 const tooltip=node('div','','friend-letter-tooltip');tooltip.id='friends-letter-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip)
 const mobile=matchMedia('(max-width:767px)')
 const fillBubble=(bubble:HTMLElement,description:string)=>{
  bubble.replaceChildren(node('span',description))
  const tail=node('span','','friend-bubble-tail');tail.setAttribute('aria-hidden','true')
  tail.innerHTML='<svg viewBox="0 0 26 20" fill="none"><path class="friend-bubble-tail-fill" d="M2 0C5 8 3 14 1 18C13 15 21 8 25 0Z"/><path class="friend-bubble-tail-line" d="M2 0C5 8 3 14 1 18C13 15 21 8 25 0"/></svg>';bubble.append(tail)
 }
 const mobileBubbles=new Map<HTMLAnchorElement,{bubble:HTMLElement;ready:boolean}>()
 let bubbleFrame=0,followFrame=0
 const placeMobileBubble=(card:HTMLAnchorElement,bubble:HTMLElement,box:DOMRect,origin:DOMRect)=>{
  const right=card.offsetLeft+card.offsetWidth/2<list.clientWidth/2
  bubble.dataset.placement=right?'right':'left'
  bubble.style.width=`${Math.min(170,innerWidth*.46)}px`
  const w=bubble.offsetWidth,h=bubble.offsetHeight
  const left=Math.max(10,Math.min(innerWidth-w-10,right?box.right+10:box.left-w-10))
  bubble.style.left=`${left-origin.left}px`
  bubble.style.top=`${box.top+18-origin.top}px`
  bubble.style.setProperty('--bubble-tail-y',`${Math.max(12,Math.min(h-28,box.height*.3-18))}px`)
 }
 const positionMobileBubbles=()=>{
  bubbleFrame=0
  const origin=list.getBoundingClientRect()
  const candidates=[...mobileBubbles].map(([card,state])=>({card,state,box:card.querySelector('.friend-stamp-art')!.getBoundingClientRect()}))
  const centered=mobile.matches?candidates.filter(({state,box})=>state.ready&&box.bottom>0&&box.top<innerHeight)
   .sort((a,b)=>Math.abs(a.box.top+a.box.height/2-innerHeight/2)-Math.abs(b.box.top+b.box.height/2-innerHeight/2)).slice(0,3):[]
  const selected=new Set(centered.map(item=>item.state))
  for(const {card,state,box} of candidates){
   state.bubble.hidden=!selected.has(state)
   if(!state.bubble.hidden)placeMobileBubble(card,state.bubble,box,origin)
  }
 }
 const followMobileBubbles=()=>{
  followFrame=0
  if(!mobile.matches||reduced.matches||document.hidden||!root.classList.contains('is-in-view'))return
  const origin=list.getBoundingClientRect()
  for(const [card,{bubble}] of mobileBubbles){
   if(!bubble.hidden)placeMobileBubble(card,bubble,card.querySelector('.friend-stamp-art')!.getBoundingClientRect(),origin)
  }
  followFrame=requestAnimationFrame(followMobileBubbles)
 }
 const syncBubbleFollowing=()=>{cancelAnimationFrame(followFrame);followFrame=0;followMobileBubbles()}
 const scheduleMobileBubbles=()=>{cancelAnimationFrame(bubbleFrame);bubbleFrame=requestAnimationFrame(positionMobileBubbles)}
 mobile.addEventListener('change',()=>{scheduleMobileBubbles();syncBubbleFollowing()},{signal})
 reduced.addEventListener('change',syncBubbleFollowing,{signal})
 document.addEventListener('visibilitychange',syncBubbleFollowing,{signal})
 let hovered:HTMLAnchorElement|undefined
 const positionTooltip=()=>{
  if(!hovered||tooltip.hidden)return
  const box=(hovered.querySelector('.friend-stamp-art')||hovered).getBoundingClientRect()
  const width=tooltip.offsetWidth,height=tooltip.offsetHeight
  const left=Math.max(12,Math.min(innerWidth-width-12,box.right-46))
  const above=box.top-height+12>=12
  tooltip.dataset.placement=above?'above':'below'
  tooltip.style.left=`${left}px`
  tooltip.style.top=`${above?box.top-height+12:Math.min(innerHeight-height-12,box.bottom-12)}px`
  tooltip.style.setProperty('--bubble-tail',`${Math.max(20,Math.min(width-24,box.right-28-left))}px`)
 }
 const hideTooltip=()=>{tooltip.hidden=true;hovered=undefined}
 // Mouse movement imparts momentum around the pin; the spring continues after it leaves.
 type HangingLetter={element:HTMLAnchorElement;angle:number;velocity:number}
 let hanging:HangingLetter[]=[],windFrame=0,windTime=0
 const cardVisibility=new IntersectionObserver(entries=>{
  for(const entry of entries){
   const card=entry.target as HTMLAnchorElement
   card.classList.toggle('is-card-visible',entry.isIntersecting)
   const entrance=cardEntrances.get(card)
   if(entrance){if(entry.isIntersecting)entrance.play();else entrance.pause()}
  }
  if(!windFrame&&hanging.some(card=>card.element.classList.contains('is-card-visible')&&(Math.abs(card.angle)>.015||Math.abs(card.velocity)>.03))){windTime=performance.now();windFrame=requestAnimationFrame(settleWind)}
 },{threshold:0})
 let pointer:{x:number;y:number;time:number}|undefined
 const settleWind=(time:number)=>{
  windFrame=0
  const elapsed=Math.min((time-windTime)/1000,.05);windTime=time
  let moving=false
  for(const card of hanging){
   if(!card.element.classList.contains('is-card-visible'))continue
   const steps=Math.max(1,Math.ceil(elapsed*120)),dt=elapsed/steps
   for(let i=0;i<steps;i++){
    card.velocity+=(-28*card.angle-4*card.velocity)*dt
    card.angle+=card.velocity*dt
   }
   if(Math.abs(card.angle)<.015&&Math.abs(card.velocity)<.03){card.angle=0;card.velocity=0}
   else moving=true
   card.element.style.setProperty('--letter-wind-angle',`${card.angle}deg`)
   const motion=threadOffset(card.element)
   if(!touchHold){
    motion.vx+=(-42*motion.x-7*motion.vx)*elapsed
    motion.vy+=(-42*motion.y-7*motion.vy)*elapsed
    motion.x+=motion.vx*elapsed;motion.y+=motion.vy*elapsed
   }
   if(Math.hypot(motion.x,motion.y,motion.vx,motion.vy)>.05)moving=true
   else {motion.x=0;motion.y=0;motion.vx=0;motion.vy=0}
   card.element.style.setProperty('--letter-wind-x',`${card.angle*.65+motion.x}px`)
   card.element.style.setProperty('--letter-wind-y',`${Math.abs(card.angle)*.12+motion.y}px`)
  }
  positionRopes()
  positionTooltip()
  scheduleMobileBubbles()
  if(moving)windFrame=requestAnimationFrame(settleWind)
 }
 root.addEventListener('pointermove',event=>{
  // Deliberate pointer interaction remains available when ambient motion is reduced.
  if(event.pointerType==='touch')return
  const now=performance.now(),previous=pointer
  pointer={x:event.clientX,y:event.clientY,time:now}
  if(!previous||now-previous.time>150)return
  const dx=event.clientX-previous.x,dy=event.clientY-previous.y
  if(Math.hypot(dx,dy)<.2)return
  for(const card of hanging){
   const box=card.element.getBoundingClientRect()
   const distance=Math.hypot((event.clientX-box.left-box.width/2)/(box.width/2+65),(event.clientY-box.top-box.height/2)/(box.height/2+45))
   if(distance>=1.5)continue
   const influence=Math.pow(Math.max(0,1-distance/1.5),2)
   const lever=Math.max(-1,Math.min(1,(event.clientX-box.left-box.width/2)/(box.width/2)))
   card.velocity=Math.max(-65,Math.min(65,card.velocity+(-dx+dy*lever*.4)*influence*2.2))
  }
  if(!windFrame){windTime=now;windFrame=requestAnimationFrame(settleWind)}
 },{signal,passive:true})
 root.addEventListener('pointerleave',()=>{pointer=undefined},{signal})
 let suppressTouchClickUntil=0
 let touchHold:{id:number;x:number;y:number;startX:number;startY:number;active:boolean}|undefined
 const releaseHold=(suppress=false)=>{
  if(suppress)suppressTouchClickUntil=performance.now()+650
  touchHold=undefined;list.classList.remove('is-held')
 }
 const threadMotion=new WeakMap<HTMLElement,{x:number;y:number;vx:number;vy:number}>()
 const threadOffset=(element:HTMLElement)=>threadMotion.get(element)??{x:0,y:0,vx:0,vy:0}
 const pullThread=(x:number,y:number,dx:number)=>{
  for(const card of hanging){
   if(!card.element.classList.contains('is-card-visible'))continue
   const box=card.element.getBoundingClientRect()
   const influence=Math.exp(-Math.pow(Math.hypot(x-box.left-box.width/2,y-box.top)/260,2))
   const motion=threadOffset(card.element)
   motion.x=Math.max(-48,Math.min(48,motion.x+dx*influence))
   motion.vx=dx*influence*12
   threadMotion.set(card.element,motion)
   card.velocity=Math.max(-80,Math.min(80,card.velocity-dx*influence*2))
  }
  positionRopes()
  if(!windFrame){windTime=performance.now();windFrame=requestAnimationFrame(settleWind)}
 }
 const touchesThread=(x:number,y:number)=>{
  const svg=list.querySelector<SVGSVGElement>('.friends-letter-rope'),path=svg?.querySelector('path')
  if(!svg||!path)return false
  const box=svg.getBoundingClientRect(),length=path.getTotalLength()
  for(let distance=0;distance<=length;distance+=8){
   const point=path.getPointAtLength(distance)
   if(Math.hypot(point.x+box.left-x,point.y+box.top-y)<24)return true
  }
  return false
 }
 root.addEventListener('touchstart',event=>{
  releaseHold(Boolean(touchHold?.active))
  if(!mobile.matches||reduced.matches||event.touches.length!==1)return
  // Bubble swipes belong to native page scrolling, never rope dragging.
  if(event.target instanceof Element&&event.target.closest('.friend-mobile-bubble'))return
  const touch=event.touches[0]
  const card=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a.friend-letter'):null
  if(!(card&&list.contains(card))&&!touchesThread(touch.clientX,touch.clientY))return
  touchHold={id:touch.identifier,x:touch.clientX,y:touch.clientY,startX:touch.clientX,startY:touch.clientY,active:false}
 },{signal,passive:true})
 root.addEventListener('touchmove',event=>{
  if(!touchHold)return
  const touch=Array.from(event.touches).find(touch=>touch.identifier===touchHold!.id)
  if(!touch||event.touches.length!==1){releaseHold(Boolean(touchHold.active));return}
  if(!touchHold.active){
   const dx=Math.abs(touch.clientX-touchHold.startX),dy=Math.abs(touch.clientY-touchHold.startY)
   if(Math.max(dx,dy)<5)return
   if(dy>=dx){releaseHold();return}
   touchHold.active=true;list.classList.add('is-held');hideTooltip()
  }
  if(event.cancelable)event.preventDefault()
  pullThread(touch.clientX,touch.clientY,touch.clientX-touchHold.x)
  touchHold.x=touch.clientX;touchHold.y=touch.clientY
 },{signal,passive:false})
 root.addEventListener('touchend',event=>{const active=Boolean(touchHold?.active);if(active&&event.cancelable)event.preventDefault();releaseHold(active)},{signal,passive:false})
 root.addEventListener('touchcancel',()=>releaseHold(Boolean(touchHold?.active)),{signal})
 root.addEventListener('contextmenu',event=>{if(touchHold?.active)event.preventDefault()},{signal})
 root.addEventListener('click',event=>{if(performance.now()<suppressTouchClickUntil){event.preventDefault();event.stopImmediatePropagation()}},{signal,capture:true})
 document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseHold(Boolean(touchHold?.active))},{signal})

 let ropeFrame=0
 let ropeOrder:HangingLetter[]=[]
 const positionRopes=()=>{
  const svg=list.querySelector<SVGSVGElement>('.friends-letter-rope'),front=list.querySelector<SVGSVGElement>('.friends-letter-rope-front');if(!svg||!front)return
  const points=ropeOrder.map(card=>({x:card.element.offsetLeft+card.element.offsetWidth/2+card.angle*.65+threadOffset(card.element).x,y:card.element.offsetTop+6+Math.abs(card.angle)*.12+threadOffset(card.element).y}))
  svg.setAttribute('viewBox',`0 0 ${list.clientWidth} ${list.clientHeight}`)
  front.setAttribute('viewBox',svg.getAttribute('viewBox')!)
  let d=''
  if(points.length){
   const first=points[0]
   if(!mobile.matches){
    const origin=list.getBoundingClientRect(),x=Math.max(16,first.x-55),y=-origin.top-window.scrollY
    const drop=Math.max(20,(first.y-y)*.6)
    d=`M ${x} ${y} C ${x} ${y+drop} ${first.x-30} ${first.y+8} ${first.x} ${first.y}`
   }else d=`M ${Math.max(4,first.x-55)} ${Math.max(2,first.y-16)} Q ${first.x-25} ${first.y+5} ${first.x} ${first.y}`
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y
    d+=` C ${a.x+dx*.4} ${a.y+dy*.15+18} ${b.x-dx*.4} ${b.y-dy*.15+18} ${b.x} ${b.y}`
   }
   const last=points[points.length-1]
   const end=Math.max(-48,Math.min(48,list.clientWidth-4-last.x))
   d+=` q ${end/2} 10 ${end} -8`
  }
  const ropePath=document.createElementNS('http://www.w3.org/2000/svg','path');ropePath.setAttribute('d',d);svg.replaceChildren(ropePath)
  const ns='http://www.w3.org/2000/svg',defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath'),group=document.createElementNS(ns,'g')
  clip.id='friends-rope-front-clips';clip.setAttribute('clipPathUnits','userSpaceOnUse')
  hanging.forEach(({element,angle},index)=>{
   if(index%2===0)return
   const polygon=document.createElementNS(ns,'polygon'),width=element.offsetWidth
   const transform=getComputedStyle(element).transform
   const matrix=transform==='none'?new DOMMatrixReadOnly():new DOMMatrixReadOnly(transform)
   const rotation=Math.atan2(matrix.b,matrix.a),c=Math.cos(rotation),s=Math.sin(rotation)
   const x=element.offsetLeft+width/2+angle*.65+threadOffset(element).x,y=element.offsetTop+6+Math.abs(angle)*.12+threadOffset(element).y
   polygon.setAttribute('points',[[0,-5],[width,-5],[width,10],[0,10]].map(([px,py])=>{
    const dx=px-width/2,dy=py-6
    return `${x+dx*c-dy*s},${y+dx*s+dy*c}`
   }).join(' '));clip.append(polygon)
  })
  defs.append(clip);group.setAttribute('clip-path','url(#friends-rope-front-clips)')
  for(const path of svg.children)group.append(path.cloneNode(true))
  front.replaceChildren(defs,group)
 }
 const arrangeRope=()=>{
  const rows:{top:number;cards:HangingLetter[]}[]=[]
  for(const card of hanging){
   const top=card.element.offsetTop
   let row=rows.find(item=>Math.abs(item.top-top)<75)
   if(!row){row={top,cards:[]};rows.push(row)}
   row.cards.push(card)
  }
  ropeOrder=rows.sort((a,b)=>a.top-b.top).flatMap((row,index)=>{
   const cards=row.cards.sort((a,b)=>a.element.offsetLeft-b.element.offsetLeft)
   return index%2?cards.reverse():cards
  })
  positionRopes()
  if(entrancePending){
   entrancePending=false;entrancePlayed=true
   for(const svg of list.querySelectorAll<SVGSVGElement>('.friends-letter-rope')){
    const path=svg.querySelector('path'),length=path?.getTotalLength()||1
    entranceAnimate(svg,[{opacity:0,strokeDasharray:`${length}`,strokeDashoffset:`${length}`},{opacity:1,strokeDasharray:`${length}`,strokeDashoffset:'0'}],{duration:950,easing:'ease-out'})
   }
   ropeOrder.forEach(({element},index)=>{
    const paper=element.querySelector<HTMLElement>('.friend-letter-paper')!
    const tilt=index%2?5:-5
    element.style.setProperty('--card-enter-delay',`${Math.min(index*(mobile.matches?32:55),mobile.matches?300:600)}ms`)
    element.style.setProperty('--card-enter-duration',mobile.matches?'500ms':'620ms')
    const animation=entranceAnimate(paper,[{opacity:0,transform:`translateY(-16px) rotate(${tilt}deg)`},{opacity:1,transform:`translateY(1px) rotate(${-tilt*.3}deg)`,offset:.72},{opacity:1,transform:'translateY(0) rotate(0deg)'}],{duration:mobile.matches?500:620,delay:Math.min(index*(mobile.matches?32:55),mobile.matches?300:600),easing:'cubic-bezier(.2,.7,.25,1)',fill:'both'},()=>{cardEntrances.delete(element);element.classList.remove('is-entering');paper.style.removeProperty('opacity');const state=mobileBubbles.get(element);if(state)state.ready=true;scheduleMobileBubbles()})
    cardEntrances.set(element,animation)
    if(!element.classList.contains('is-card-visible'))animation.pause()
   })
  }
  locateCard()
 }
 const scheduleRopes=()=>{cancelAnimationFrame(ropeFrame);ropeFrame=requestAnimationFrame(arrangeRope)}
 const draw=()=>{
  if(signal.aborted)return
  releaseHold(Boolean(touchHold?.active));cardVisibility.disconnect();for(const animation of cardEntrances.values())animation.cancel();cardEntrances.clear()
  cancelAnimationFrame(windFrame);windFrame=0;hanging=[];pointer=undefined
  for(const {bubble} of mobileBubbles.values())bubble.remove();mobileBubbles.clear()
  entrancePending=!entrancePlayed&&friends.length>0
  const fragment=document.createDocumentFragment(),dust=node('div','','friends-letter-dust');dust.setAttribute('aria-hidden','true')
  for(let i=0;i<14;i++){const dot=node('i');dot.style.left=((i*61.8+7)%100)+'%';dot.style.top=((i*37.7+11)%100)+'%';dot.style.setProperty('--delay',`${-i*.7}s`);dust.append(dot)}
  fragment.append(dust)
  const rope=document.createElementNS('http://www.w3.org/2000/svg','svg');rope.classList.add('friends-letter-rope');rope.setAttribute('aria-hidden','true');fragment.append(rope)
  friends.forEach((friend,i)=>{
   const letter=node('a','','friend-letter');letter.classList.toggle('is-unavailable',(friend.healthFailures||0)>0);if((friend.healthFailures||0)>0)letter.setAttribute('aria-label',`${friend.name}，暂时无法访问`);letter.href=friend.url;letter.target='_blank';letter.rel='noopener noreferrer';letter.dataset.noPopover='true';letter.draggable=false;letter.dataset.tone=String(i%5);letter.dataset.cardNumber=String(friend.number??i+1).padStart(3,'0');letter.id=`friend-card-${letter.dataset.cardNumber}`
   let mobileSeed=2166136261
   for(const character of friend.id)mobileSeed=Math.imul(mobileSeed^character.charCodeAt(0),16777619)
   const mobileRandom=()=>{mobileSeed|=0;mobileSeed=mobileSeed+0x6D2B79F5|0;let n=Math.imul(mobileSeed^mobileSeed>>>15,1|mobileSeed);n^=n+Math.imul(n^n>>>7,61|n);return ((n^n>>>14)>>>0)/4294967296}
   letter.style.setProperty('--mobile-shift',`${(mobileRandom()-.5)*36}%`)
   letter.style.setProperty('--mobile-angle',`${(mobileRandom()-.5)*24}deg`)
   letter.style.setProperty('--mobile-gap',`${-72+mobileRandom()*36}px`)
   letter.style.setProperty('--mobile-width',`${142+mobileRandom()*32}px`)
   letter.style.setProperty('--letter-angle',`${[-2,1.5,-1,2,-1.7,.8][i%6]}deg`);letter.style.setProperty('--letter-offset',`${[0,18,5,13,-2,20][i%6]}px`);letter.style.setProperty('--letter-width',`${[158,166,152,164,156,160][i%6]}px`);letter.style.setProperty('--letter-delay',`${-i*1.3}s`);letter.style.setProperty('--letter-duration',`${[5.8,7.1,6.4,7.6,6.8,6.1][i%6]}s`);letter.setAttribute('aria-label',`${friend.name}，在新标签页打开`)
   hanging.push({element:letter,angle:0,velocity:0})
   const paper=node('div','','friend-letter-paper'),edge=node('div','','friend-letter-edge'),stamp=node('div','','friend-stamp'),stampTop=node('div','','friend-stamp-top')
   if(entrancePending){paper.style.opacity='0';letter.classList.add('is-entering')}
   stampTop.append(node('h3',friend.name),node('span',`#${String(friend.number??i+1).padStart(3,'0')}`,'friend-letter-number'))
   const artwork=node('div','','friend-stamp-art')
   const avatar=node('span','','friend-letter-avatar');avatar.setAttribute('aria-hidden','true');avatar.append(node('span',Array.from(friend.name)[0]))
   if(friend.avatar){
    avatar.classList.add('is-loading')
    const image=node('img');image.alt='';image.draggable=false;image.loading='lazy';image.decoding='async';image.referrerPolicy='strict-origin-when-cross-origin'
    const failed=()=>{avatar.classList.remove('is-loading');image.remove()}
    image.addEventListener('error',failed,{once:true,signal})
    image.addEventListener('load',async()=>{
     try{await image.decode()}catch{/* A decoded image may already be available. */}
     if(signal.aborted)return
     if(!image.naturalWidth){failed();return}
     avatar.classList.remove('is-loading');avatar.classList.add('is-loaded')
    },{once:true,signal})
    avatar.append(image);image.src=friend.avatar
   }
   artwork.append(avatar)
   stamp.append(stampTop,artwork);edge.append(stamp)
   const caption=node('div','','friend-letter-caption')
   const destination=node('div','','friend-letter-destination');destination.append(node('span',new URL(friend.url).host.replace(/^www\./,'')))
   destination.append(sitePostmark(friend))
   caption.append(destination);paper.append(edge,caption);letter.append(paper)
   const activate=()=>{if(mobile.matches)return;const entering=hovered!==letter;hovered=letter;if(friend.description){fillBubble(tooltip,friend.description);tooltip.hidden=false;letter.setAttribute('aria-describedby',tooltip.id);positionTooltip();if(entering&&!reduced.matches)tooltip.animate([{opacity:0,translate:'0 2px'},{opacity:1,translate:'0 0'}],{duration:160,easing:'cubic-bezier(.2,.8,.3,1)'})}else hideTooltip();for(const item of list.querySelectorAll('.friend-letter'))item.classList.toggle('is-active',item===letter)}
   if(friend.description){
    const bubble=node('div','','friend-letter-tooltip friend-mobile-bubble');bubble.hidden=true;bubble.setAttribute('aria-hidden','true');fillBubble(bubble,friend.description)
    mobileBubbles.set(letter,{bubble,ready:!entrancePending})
   }
   letter.addEventListener('pointerleave',hideTooltip,{signal});letter.addEventListener('blur',hideTooltip,{signal});letter.addEventListener('pointerenter',activate,{signal});letter.addEventListener('focus',activate,{signal});letter.addEventListener('pointerdown',activate,{signal});fragment.append(letter)
  })
  const frontRope=document.createElementNS('http://www.w3.org/2000/svg','svg');frontRope.classList.add('friends-letter-rope','friends-letter-rope-front');frontRope.setAttribute('aria-hidden','true');fragment.append(frontRope)
  if(!friends.length)fragment.append(node('p','友链正在整理中。','friends-empty'))
  hideTooltip();list.classList.toggle('is-crowded',friends.length>=5);list.replaceChildren(fragment);for(const {bubble} of mobileBubbles.values())list.append(bubble);for(const {element} of hanging)cardVisibility.observe(element);scheduleRopes();scheduleMobileBubbles()
  list.onpointerleave=()=>{for(const item of list.querySelectorAll('.friend-letter'))item.classList.remove('is-active')}
 }
 const reads=new RequestCache<FriendLink[]>(0,1)
 const load=async(fresh=false)=>{
  if(fresh)reads.clear()
  try{const next=await reads.read('friends',async requestSignal=>{const response=await fetch('/api/site/friends',{signal:AbortSignal.any([requestSignal,AbortSignal.timeout(15000)]),cache:'no-store'});if(!response.ok)throw new Error();const value=await response.json();return parseFriends(value.friends)},{signal}),key=JSON.stringify(next);if(signal.aborted||key===signature)return;signature=key;friends=next;list.setAttribute('aria-busy','false');draw()}
  catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;if(!signal.aborted&&!friends.length){const retry=node('button','读取失败，点击重试','friends-retry');retry.onclick=()=>void load();list.replaceChildren(retry);list.setAttribute('aria-busy','false')}}
 }
 const ropeResize=new ResizeObserver(scheduleRopes);ropeResize.observe(list)
 const visible=new IntersectionObserver(entries=>{root.classList.toggle('is-in-view',entries[0].isIntersecting);syncBubbleFollowing()});visible.observe(list)
 void document.fonts.ready.then(()=>{if(!signal.aborted)scheduleRopes()})
 void load();const poll=setInterval(()=>{if(!document.hidden)void load()},30000)
 window.addEventListener('resize',()=>{positionTooltip();scheduleMobileBubbles()},{signal});window.addEventListener('scroll',()=>{positionTooltip();scheduleMobileBubbles()},{passive:true,signal,capture:true})
 window.addEventListener('focus',()=>void load(),{signal});document.addEventListener('friends-changed',()=>void load(true),{signal})
 window.addCleanup(()=>{releaseHold();const toast=sidebar?.querySelector('.decrypt-toast');if(toast)document.body.append(toast);if(confirmation?.open)confirmation.close();cardVisibility.disconnect();if(sidebar?.open)sidebar.close();cancelAnimationFrame(followFrame);cancelAnimationFrame(bubbleFrame);for(const {bubble} of mobileBubbles.values())bubble.remove();for(const animation of entranceAnimations)animation.cancel();ropeResize.disconnect();cancelAnimationFrame(ropeFrame);cancelAnimationFrame(windFrame);controller.abort();tooltip.remove();visible.disconnect();clearInterval(poll)})
})
