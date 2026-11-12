import { setupSecurityManager } from "./stellarSecurity"
import {setupServiceManager} from './serviceManager'
import {setupAlertCenter} from './alertCenter'
import {setupDataManager} from './dataManager'
import {showPasswordToast} from './passwordFeedback'
import {adminPassword} from './driveAdminFields'
import { setupUpstreamManager } from './upstreamManager'
import { setupContentPublishing } from './contentPublishing'
import { setupNavigationManager } from './navigationManager'
import { setupFriendManager } from './friendManager'
import { setupFeedbackManager } from './feedbackManager'
import { refreshSiteSettings } from './siteSettings'
import { showSiteDialog } from './siteDialog'
type Field = { key: string; group: string; label: string; type: string; category?: string; min?: number; max?: number; step?: number; maxLength?: number; options?: [string,string][]; help?: string }
document.addEventListener('nav', () => {
  const root = document.querySelector<HTMLElement>('[data-stellar-admin]'); if (!root) return
  const controller = new AbortController(), signal = controller.signal; window.addCleanup(() => controller.abort())
  const settings = root.querySelector<HTMLElement>('[data-stellar-settings]')!, fields = root.querySelector<HTMLElement>('[data-stellar-fields]')!
  const loading=root.querySelector<HTMLElement>('[data-stellar-loading]')!,retry=root.querySelector<HTMLButtonElement>('[data-stellar-retry]')!
  const preview=document.createElement('dialog'),previewHeader=document.createElement('header'),previewTitle=document.createElement('h2'),previewClose=document.createElement('button'),previewImage=document.createElement('img'),previewStatus=document.createElement('p')
  preview.className='stellar-avatar-dialog';preview.id='stellar-avatar-preview';preview.tabIndex=-1;preview.setAttribute('aria-labelledby','stellar-avatar-preview-title');previewTitle.id='stellar-avatar-preview-title';previewTitle.textContent='头像预览';previewClose.type='button';previewClose.setAttribute('aria-label','关闭头像预览');previewClose.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>';previewImage.alt='首页头像';previewImage.hidden=true;previewStatus.setAttribute('role','status');previewHeader.append(previewTitle,previewClose);preview.append(previewHeader,previewImage,previewStatus);root.append(preview)
  previewClose.onclick=()=>preview.close()
  preview.addEventListener('click',event=>{if(event.target!==preview)return;const box=preview.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)preview.close()},{signal})
  previewImage.onload=()=>{previewImage.hidden=false;previewStatus.hidden=true}
  previewImage.onerror=()=>{previewImage.hidden=true;previewStatus.hidden=false;previewStatus.textContent='图片暂时无法显示'}
  const management=root.closest('dialog');management?.addEventListener('close',()=>{if(preview.open)preview.close()},{signal})
  signal.addEventListener('abort',()=>{if(preview.open)preview.close();preview.remove()},{once:true})
  const request = async (path: string, init: RequestInit = {}) => { const response = await fetch('/api/site'+path, { ...init, credentials: 'same-origin', cache: 'no-store', signal, headers: { 'Content-Type': 'application/json' } }); const result = await response.json(); if (!response.ok) throw new Error(result.error || '请求失败'); return result }
  let loadingSettings=false
  const load = async () => {
    if(loadingSettings||signal.aborted)return
    loadingSettings=true;settings.hidden=true;loading.hidden=false;loading.classList.remove('is-error');retry.hidden=true
    loading.querySelector('strong')!.textContent='正在读取配置';loading.querySelector('span:last-of-type')!.textContent='稍候，即将进入管理工作区'
    try{
    const result: { schema: Field[]; values: Record<string, string|number|boolean> } = await request('/admin/settings')
    if(signal.aborted)return
    result.schema.push({key:'security.totp',group:'账户安全',label:'验证器',type:'security'})
    result.schema.push({key:'alerts.records',group:'告警中心',label:'告警记录',type:'alerts'})
    result.schema.push({key:'data.maintenance',group:'数据管理',label:'数据维护',type:'data'})
    result.schema.push({key:'friends.manage',group:'友链管理',label:'友链',type:'friends'})
    result.schema.push({key:'feedback.manage',group:'反馈管理',label:'反馈',type:'feedback'})
    result.schema.push({key:'upstreams.credentials',group:'服务接入',label:'平台凭据',type:'credentials'})
    fields.replaceChildren()
    const navigation = root.querySelector<HTMLElement>('[data-stellar-modules]')!; navigation.replaceChildren()
    const designs: Record<string, {id:string; title:string; description:string; icon:string}> = {
      '首页展示': {id:'profile',title:'首页',description:'首页头像、身份信息、网站简介与联系方式。',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'},
      '视频': {id:'video',title:'视频',description:'播放默认值、字幕与弹幕显示设置，个人播放记忆优先。',icon:'<rect x="3" y="4" width="18" height="14" rx="2"/><path d="m10 8 5 3-5 3V8Zm-3 13h10"/>'},
      '星轨': {id:'graph',title:'星轨',description:'文章的新星标记与孤星特效。',icon:'<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-30 12 12)"/><path d="m18 3 .6 1.4L20 5l-1.4.6L18 7l-.6-1.4L16 5l1.4-.6Z"/>'},
      '服务接入': {id:'integrations',title:'服务',description:'统一管理 OpenList、媒体、仓库、评论、监控与首页数据源及平台凭据。保存后由对应服务读取。',icon:'<path d="M14 5a5 5 0 1 1-4 8l-6 6H2v-3l6-6a5 5 0 0 1 6-5Z"/><circle cx="16" cy="8" r="1"/>'},
      '任务管理': {id:'tasks',title:'任务',description:'配置后台任务执行周期与失败重试等待时间，保存后自动生效。友链巡检使用北京时间。',icon:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'},
      '数据管理': {id:'data',title:'数据',description:'维护本站数据记录，支持查询、新增、编辑与删除。',icon:'<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="m8 8 8 8M15 5h5v5M9 19H4v-5"/>'},
      '友链管理': {id:'friends',title:'友链',description:'管理友链资料、展示顺序与申请审核。',icon:'<path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2M7 11l-2 2a5 5 0 0 0 7 7l2-2"/>'},
      '反馈管理': {id:'feedback',title:'反馈',description:'查看访客反馈并管理处理状态。',icon:'<path d="M21 11a8 8 0 0 1-8 8H7l-5 3V11a9 9 0 0 1 19 0Z"/><path d="M7 9h10M7 13h6"/>'},
      '告警中心': {id:'alerts',title:'告警',description:'查看服务异常、外部接口失败及后台任务错误。',icon:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/><path d="M12 6v4m0 3h.01"/>'},
      '内容发布': {id:'publishing',title:'内容',description:'控制构建排除与隐藏展示，保存后手动重载生效。',icon:'<path d="M4 4h16v16H4zM8 9h8M8 13h5"/><path d="m16 16 2 2 3-3"/>'},
      '账户安全':{id:'security',title:'账户',description:'管理管理员验证器与恢复码。',icon:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'},
      '寻径': {id:'links',title:'寻径',description:'管理寻径链接、显示顺序与备案信息。',icon:'<path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2M7 11l-2 2a5 5 0 0 0 7 7l2-2"/>'},
    }
    const category = (field:Field) => {
      if(field.category)return field.category
      if(field.key.startsWith('profile.qq'))return '联系方式'
      if(field.group==='首页展示')return '身份信息'
      if(field.key.startsWith('danmuku.pc'))return '电脑端'
      if(field.key.startsWith('danmuku.mobile'))return '移动端'
      if(field.group==='星轨')return '文章与节点'
      if(field.group==='内容发布')return '文件与目录规则'
      if(field.type==='navigation')return '链接'
      if(field.group==='寻径')return '备案信息'
      return '播放默认值'
    }
    const grouped = new Map<string,Field[]>()
    for(const field of result.schema.filter(field=>field.key!=='graph.adminOrbit')){const group=grouped.get(field.group)||[];group.push(field);grouped.set(field.group,group)}
    const activators:((()=>void)|undefined)[]=[]
    const tabs:HTMLButtonElement[]=[], panels:HTMLElement[]=[], dirty=new Set<string>()
    let remembered='';try{remembered=sessionStorage.getItem('stellar-admin-module')||''}catch{}
    const selectModule=(index:number,focus=false)=>{
      tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;panels[i].hidden=i!==index})
      fields.scrollTop=0
      activators[index]?.()
      try{sessionStorage.setItem('stellar-admin-module',tabs[index].dataset.moduleId!)}catch{}
      if(focus)tabs[index].focus({preventScroll:true})
    }
    const order=[...Object.keys(designs),...Array.from(grouped.keys()).filter(key=>!designs[key])]
    for(const name of order){
      const entries=grouped.get(name);if(!entries?.length)continue
      const design=designs[name]||{id:`group-${tabs.length}`,title:name,description:'管理此模块的站点配置。',icon:'<circle cx="12" cy="12" r="7"/>'}
      const tab=document.createElement('button'),panel=document.createElement('section'),intro=document.createElement('header'),title=document.createElement('h2'),description=document.createElement('p')
      tab.type='button';tab.className='stellar-admin-tab';tab.dataset.moduleId=design.id;tab.id=`stellar-tab-${design.id}`;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`stellar-panel-${design.id}`)
      tab.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${design.icon}</svg>`
      const nameNode=document.createElement('span'),count=document.createElement('span'),indicator=document.createElement('i');nameNode.textContent=design.title;count.textContent=String(entries.length);count.className='stellar-admin-tab-count';if(name==='告警中心')count.hidden=true;indicator.className='stellar-admin-unsaved';indicator.hidden=true;indicator.setAttribute('aria-label','有未保存修改');tab.append(nameNode,count,indicator)
      panel.id=`stellar-panel-${design.id}`;panel.className='stellar-admin-module';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.tabIndex=0
      intro.className='stellar-admin-module-intro';title.textContent=design.title;description.textContent=design.description
      const moduleIcon=document.createElement('span'),introCopy=document.createElement('div');moduleIcon.className='stellar-admin-module-icon';moduleIcon.innerHTML=tab.querySelector('svg')!.outerHTML;moduleIcon.setAttribute('aria-hidden','true');introCopy.append(title,description);intro.append(moduleIcon,introCopy);panel.append(intro)
      const index=tabs.length;tabs.push(tab);panels.push(panel);navigation.append(tab);fields.append(panel);tab.onclick=()=>selectModule(index)
      if(name==='账户安全'){setupSecurityManager(panel,signal,request);continue}
      if(name==='告警中心'){
        let refresh:(()=>void)|undefined
        activators[index]=()=>{if(!refresh)refresh=setupAlertCenter(panel,signal,request);else refresh()}
        continue
      }
      const managedContent=(content:HTMLElement,setup:(content:HTMLElement,own:AbortSignal)=>void)=>{
        let started=false,controller=new AbortController()
        const activate=()=>{if(!started){started=true;setup(content,AbortSignal.any([signal,controller.signal]))}}
        document.addEventListener('stellar-data-changed',()=>{
          controller.abort();controller=new AbortController();started=false;content.replaceChildren()
          if(!panel.hidden&&!content.hidden)activate()
        },{signal})
        return activate
      }
      if(['数据管理','友链管理','反馈管理'].includes(name)){
        const content=document.createElement('div');content.className='friend-admin';panel.append(content)
        if(name==='数据管理'){
          let started=false
          activators[index]=()=>{if(!started){started=true;setupDataManager(content,signal,request)}else content.dispatchEvent(new Event('data-refresh'))}
        }else activators[index]=managedContent(content,name==='友链管理'?(content,own)=>{
          void request('/admin/data/friends').then(data=>{if(!own.aborted)setupFriendManager(content,data.friends,own,request)}).catch(error=>{if(!own.aborted)showPasswordToast(error.message,true)})
        }:(content,own)=>setupFeedbackManager(content,own,request))
        continue
      }
      let settingsContent:HTMLElement=panel
      if(name==='服务接入'){
        const serviceTabs=document.createElement('div'),configuration=document.createElement('div'),services=document.createElement('div')
        serviceTabs.className='data-admin-tabs';services.className='friend-admin service-manager';services.hidden=true
        panel.append(serviceTabs,configuration,services);settingsContent=configuration
        const activateServices=managedContent(services,(content,own)=>setupServiceManager(content,own,request))
        const choices=[{title:'服务接入',content:configuration},{title:'服务列表',content:services}]
        const buttons=choices.map(choice=>{
          const button=document.createElement('button');button.type='button';button.textContent=choice.title;button.setAttribute('aria-pressed',String(choice.content===configuration));serviceTabs.append(button)
          button.onclick=()=>{choices.forEach((other,i)=>{other.content.hidden=other!==choice;buttons[i].setAttribute('aria-pressed',String(other===choice))});if(choice.content===services)activateServices()}
          return button
        })
        activators[index]=()=>{if(!services.hidden)activateServices()}
      }
      const cards=new Map<string,HTMLElement>()
      for(const field of entries.filter(field=>field.type!=='credentials').sort((a,b)=>name==='寻径'?Number(a.key!=='icp.items')-Number(b.key!=='icp.items'):0)){
        const groupName=category(field);let card=cards.get(groupName)
        if(!card){card=document.createElement('section');card.className='stellar-setting-card';const heading=document.createElement('h3');heading.textContent=groupName;card.append(heading);settingsContent.append(card);cards.set(groupName,card)}
        if(field.type==='navigation'){setupNavigationManager(card,result.values[field.key],async value=>{await request(`/admin/settings/${encodeURIComponent(field.key)}`,{method:'PUT',body:JSON.stringify({value})});await refreshSiteSettings()},field.key==='icp.items'?'备案信息':'寻径链接');continue}
        const row=document.createElement('form'),copy=document.createElement('div'),label=document.createElement('label'),controls=document.createElement('div'),save=document.createElement('button'),status=document.createElement('span')
        row.className='stellar-setting-row';row.dataset.fieldType=field.type;copy.className='stellar-setting-copy';label.textContent=field.label;controls.className='stellar-setting-control';status.className='stellar-setting-status';status.id=`stellar-status-${field.key.replaceAll('.','-')}`;status.setAttribute('role','status')
        let input:HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement
        let passwordField:HTMLElement|undefined
        if(field.type==='password'){passwordField=document.createElement('div');passwordField.className='stellar-setting-password';input=adminPassword(passwordField,field.label,String(result.values[field.key]||''),true)}
        else if(field.type==='select'){const select=document.createElement('select');for(const[value,text]of field.options||[])select.append(new Option(text,value));select.value=String(result.values[field.key]);input=select}
        else if(field.type==='textarea'){const textarea=document.createElement('textarea');textarea.rows=4;textarea.value=String(result.values[field.key]||'');if(field.max)textarea.maxLength=field.max;input=textarea}
        else{const element=document.createElement('input');element.type=field.type==='boolean'?'checkbox':field.type==='number'?'number':field.type==='url'?'url':field.type==='time'?'time':'text';if(field.type==='boolean'){element.checked=Boolean(result.values[field.key]);element.setAttribute('role','switch')}else element.value=String(result.values[field.key]);if(field.type==='number'){element.required=true;if(field.min!==undefined)element.min=String(field.min);if(field.max!==undefined)element.max=String(field.max);if(field.step!==undefined)element.step=String(field.step)}else if(field.max)element.maxLength=field.max;input=element}
        const percentage=field.key==='video.volume'||field.key==='danmuku.opacity'
        if(percentage){const numeric=input as HTMLInputElement;numeric.value=String(Math.round(Number(result.values[field.key])*100));numeric.min=String(Number(field.min||0)*100);numeric.max=String(Number(field.max||1)*100);numeric.step=String(Math.round(Number(field.step||.01)*100))}
        input.id=`stellar-setting-${field.key.replaceAll('.','-')}`;label.htmlFor=input.id;input.setAttribute('aria-describedby',status.id);save.type='submit';save.textContent='保存';save.disabled=true
        copy.append(label)
        if(field.help){const help=document.createElement('small');help.textContent=field.help;help.id=`${input.id}-help`;input.setAttribute('aria-describedby',`${help.id} ${status.id}`);copy.append(help)}
        const unit=percentage?'%':field.key.endsWith('Size')?'px':field.key.endsWith('Speed')?'秒':field.key==='graph.newDays'||field.key==='tasks.friendsEveryDays'?'天':field.key.startsWith('tasks.')&&field.key.endsWith('Seconds')?'秒':''
        if(unit){const wrapper=document.createElement('div'),suffix=document.createElement('span');wrapper.className='stellar-input-with-unit';suffix.textContent=unit;suffix.setAttribute('aria-hidden','true');wrapper.append(input,suffix);controls.append(wrapper,save);input.setAttribute('aria-label',`${field.label}（${unit}）`)}else controls.append(passwordField||input,save)
        row.append(copy,controls,status);card.append(row)
        let switchLabel:HTMLElement|undefined
        if(field.type==='boolean'){switchLabel=document.createElement('span');switchLabel.className='stellar-switch-label';controls.insertBefore(switchLabel,save)}
        if(field.type==='asset'){
          const heading=document.createElement('div'),toggle=document.createElement('button');heading.className='stellar-setting-label-line';toggle.className='stellar-asset-preview';toggle.type='button';toggle.textContent='预览';toggle.setAttribute('aria-haspopup','dialog');toggle.setAttribute('aria-controls',preview.id);copy.insertBefore(heading,label);heading.append(label,toggle)
          toggle.onclick=()=>{
            const url=input.value.trim(),allowed=url.startsWith('/static/')||/^https:\/\//i.test(url);previewImage.hidden=true;previewStatus.hidden=false;previewStatus.textContent=allowed?'正在加载头像…':'请填写本站图片路径或 HTTPS 地址';showSiteDialog(preview);if(allowed)previewImage.src=url
          }
        }
        let saved=result.values[field.key],busy=false
        const value=()=>field.type==='boolean'?(input as HTMLInputElement).checked:field.type==='number'?Number(input.value)/(percentage?100:1):input.value
        const update=()=>{const changed=value()!==saved;row.classList.toggle('is-dirty',changed);if(changed)dirty.add(field.key);else dirty.delete(field.key);if(switchLabel)switchLabel.textContent=value()?'已开启':'已关闭';save.disabled=busy||!changed;indicator.hidden=!entries.some(entry=>dirty.has(entry.key));tab.setAttribute('aria-label',`${design.title}，${entries.length} 项设置${indicator.hidden?'':'，有未保存修改'}`);panel.dispatchEvent(new Event('stellar-setting-change'))}
        input.oninput=input.onchange=()=>{status.textContent='';status.classList.remove('is-error');update()}
        row.onsubmit=async event=>{
          event.preventDefault();if(busy||value()===saved)return
          const submitted=value();busy=true;input.disabled=true;save.disabled=true;save.textContent='保存中';status.textContent='';status.classList.remove('is-error');row.setAttribute('aria-busy','true')
          try{const response=await request(`/admin/settings/${encodeURIComponent(field.key)}`,{method:'PUT',body:JSON.stringify({value:submitted})});saved=response.value;if(field.type==='boolean')(input as HTMLInputElement).checked=Boolean(saved);else input.value=String(field.type==='number'&&percentage?Math.round(Number(saved)*100):saved);showPasswordToast('已保存');await refreshSiteSettings();if(field.key.startsWith('openlist.'))document.dispatchEvent(new CustomEvent('stellar-share-settings-changed'))}
          catch(error){showPasswordToast(error instanceof Error?error.message:'保存失败',true)}
          finally{busy=false;if(!signal.aborted){input.disabled=false;save.textContent='保存';row.removeAttribute('aria-busy');update()}}
        }
        update()
      }
      if(name==='服务接入')setupUpstreamManager(settingsContent,signal,request)
      if(name==='内容发布')setupContentPublishing(panel,signal,request)
    }
    navigation.addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
      const index=tabs.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;event.preventDefault()
      selectModule(event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+tabs.length)%tabs.length,true)
    },{signal})
    if(tabs.length)selectModule(Math.max(0,tabs.findIndex(tab=>tab.dataset.moduleId===remembered)))
    settings.hidden = false
    loading.hidden=true
    }catch(error){if(!signal.aborted){settings.hidden=true;loading.classList.add('is-error');loading.querySelector('strong')!.textContent='星枢配置';loading.querySelector('span:last-of-type')!.textContent='点击重试读取配置';retry.hidden=false;showPasswordToast(error instanceof Error?error.message:'配置读取失败',true)}}
    finally{loadingSettings=false}
  }
  retry.onclick=()=>void load()
  document.addEventListener('stellar-session-resolved', event => {
    if ((event as CustomEvent).detail?.authenticated) void load().catch(() => {})
    else { settings.hidden = true; fields.replaceChildren(); root.querySelector('[data-stellar-modules]')!.replaceChildren(); root.closest('dialog')?.close() }
  }, { signal })
})
