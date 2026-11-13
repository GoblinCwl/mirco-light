import {showPasswordToast} from './passwordFeedback'
import {showAdminListMessage} from './adminListState'
import { defaultFriends, parseFriends, type FriendLink } from '../../util/friends.mjs'
import { node } from './driveUi'

export function setupFriendManager(root: HTMLElement, initial: unknown, signal: AbortSignal, request: (path: string, init?: RequestInit) => Promise<{friends: FriendLink[];avatarChanged?:boolean}>) {
  let friends: FriendLink[]
  try { friends = parseFriends(initial ?? defaultFriends) } catch { friends = [] }
  let busy = false
  const status = node('p', '', 'friend-admin-status'); status.setAttribute('role', 'status')
  const persist = async (path: string, method: string, value?: unknown) => {
    if (busy || signal.aborted) return false
    busy = true; status.textContent = ''; status.classList.remove('is-error')
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement>('input,button,textarea,select')]
    const disabled = controls.map(control => control.disabled); controls.forEach(control => control.disabled = true)
    try { const result = await request('/admin/data/friends'+path, {method, ...(value === undefined ? {} : {body:JSON.stringify(value)})}); if (signal.aborted) return false; friends = parseFriends(result.friends); document.dispatchEvent(new Event('friends-changed')); showPasswordToast(path.endsWith('/auto-review')?'已加入后台处理队列':method==='DELETE'?'已删除':'已保存'); return true }
    catch (error) { if (!signal.aborted) { showPasswordToast(error instanceof Error ? error.message : '保存失败',true) }; return false }
    finally { busy = false; controls.forEach((control, i) => control.disabled = disabled[i]) }
  }
  const manageAvatar = (friend: FriendLink) => {
    const panel=node('section','','friend-avatar-manager'),header=node('header','','friend-admin-heading'),back=node('button','返回列表')
    back.type='button';back.onclick=render;header.append(node('h3',`${friend.name} · 头像管理`),back)
    const source=friend.avatarSource||(/^https?:\/\//i.test(friend.avatar)?friend.avatar:'')
    const info=node('p',source?`原始地址：${source}`:'尚未填写原始头像地址，请先编辑友链。','data-admin-note')
    const previews=node('div','','friend-avatar-previews')
    const preview=(label:string,address:string)=>{
      const figure=node('figure'),image=node('img'),caption=node('figcaption',label),hash=node('code',address.match(/\/([a-f0-9]{64})\./)?.[1]||'尚无内容哈希')
      image.alt=label;image.referrerPolicy='strict-origin-when-cross-origin'
      if(address)image.src=address;else image.hidden=true
      const placeholder=node('span',Array.from(friend.name)[0],'friend-avatar-placeholder');placeholder.hidden=!!address
      image.onerror=()=>{image.hidden=true;placeholder.hidden=false}
      figure.append(caption,image,placeholder,hash);previews.append(figure)
      return {image,hash,placeholder}
    }
    preview('刷新前',friend.avatar)
    const current=preview('当前头像',friend.avatar),footer=node('div','','friend-admin-footer'),refresh=node('button','获取并刷新头像'),message=node('p','重新获取源图片并先对比 SHA-256；源图片及压缩配置未变时复用已有头像，否则压缩后更新。','data-admin-note')
    message.setAttribute('role','status');refresh.className='friend-admin-submit';refresh.type='button';refresh.disabled=!source;footer.append(refresh)
    refresh.onclick=async()=>{
      if(busy||signal.aborted)return
      busy=true;refresh.disabled=true;back.disabled=true;refresh.textContent='正在获取并压缩…';message.textContent='正在获取源图片并检查哈希，必要时压缩，请稍候…'
      try{
        const result=await request('/admin/data/friends/'+encodeURIComponent(friend.id)+'/avatar-refresh',{method:'PUT',body:'{}'})
        if(signal.aborted)return
        friends=parseFriends(result.friends);const updated=friends.find(item=>item.id===friend.id)
        if(updated){current.image.hidden=false;current.placeholder.hidden=true;current.image.src=updated.avatar;current.hash.textContent=updated.avatar.match(/\/([a-f0-9]{64})\./)?.[1]||'尚无内容哈希'}
        document.dispatchEvent(new Event('friends-changed'))
        message.textContent=result.avatarChanged?'头像已更新，可对比刷新前后的图片和哈希。':'压缩后哈希一致，头像未变化，未重复上传。';showPasswordToast(result.avatarChanged?'头像已更新':'头像未变化')
      }catch(error){if(!signal.aborted){message.textContent=error instanceof Error?error.message:'头像刷新失败';showPasswordToast(message.textContent,true)}}
      finally{busy=false;refresh.disabled=!source;back.disabled=false;refresh.textContent='获取并刷新头像'}
    }
    panel.append(header,info,previews,message,footer);root.replaceChildren(panel)
  }
  const edit = (friend: FriendLink, reviewing=false) => {
    status.textContent = ''; status.classList.remove('is-error')
    const form = node('form', '', 'friend-admin-form'), header = node('header', '', 'friend-admin-heading'), back = node('button', '返回列表')
    back.type = 'button'; back.onclick = render; header.append(node('h3', reviewing ? '审核友链' : '编辑友链'), back)
    const fields = node('div', '', 'friend-admin-fields')
    const field = (title: string, value: string, type = 'text') => {
      const label = node('label', title), input = node('input'); input.type = type; input.value = value; label.append(input); fields.append(label); return input
    }
    const name = field('站点名称', friend?.name || ''); name.required = true; name.maxLength = 80; name.autocomplete = 'off'
    const url = field('网站链接', friend?.url || '', 'url'); url.required = true; url.maxLength = 1500; url.placeholder = 'https://'
    const backlink = field('包含本站友链的页面地址', friend?.backlinkUrl || '', 'url'); backlink.required = true; backlink.maxLength = 1500; backlink.placeholder = 'https://example.com/friends'; backlink.pattern = '[Hh][Tt][Tt][Pp][Ss]://.+'; backlink.title = '请填写包含本站友链的页面 HTTPS 地址'; backlink.parentElement!.classList.add('is-wide')
    const validateURL = () => {
      backlink.setCustomValidity('')
      if (!backlink.value.trim()) { backlink.setCustomValidity('请填写包含本站友链的页面地址'); return }
      try {
        const address = new URL(backlink.value.trim())
        if (!/^https:\/\//i.test(backlink.value.trim()) || address.protocol !== 'https:' || !address.hostname || address.username || address.password) throw new Error()
      } catch { backlink.setCustomValidity('包含本站友链的页面地址须为有效的 HTTPS 链接') }
    }
    backlink.addEventListener('input', validateURL, { signal }); validateURL()
    const rss = field('RSS 地址（排序依据）', friend?.rssUrl || '', 'url'); rss.maxLength=1500; rss.placeholder='https://example.com/feed.xml'; rss.pattern='[Hh][Tt][Tt][Pp][Ss]?://.+'; rss.title='请填写 HTTP 或 HTTPS RSS 地址，或留空'; rss.parentElement!.classList.add('is-wide')
    const avatar = field('头像链接', friend?.avatar || ''); avatar.maxLength = 1500; avatar.placeholder = '图片地址，留空使用名称首字'; avatar.parentElement!.classList.add('is-wide')
    const avatarSource=field('原始头像地址（选填，每日 06:00 检查）',friend?.avatarSource||'','url');avatarSource.maxLength=1500;avatarSource.placeholder='填写远程头像地址；留空不参与每日更新';avatarSource.pattern='[Hh][Tt][Tt][Pp][Ss]?://.+';avatarSource.parentElement!.classList.add('is-wide')
    const descriptionLabel = node('label', '站点简介'), description = node('textarea'); description.value = friend?.description || ''; description.rows = 3; description.maxLength = 300
    descriptionLabel.className = 'is-wide'; descriptionLabel.append(description); fields.append(descriptionLabel)
    const stateLabel=node('label',reviewing?'审核结果':'状态'),state=node('select');for(const value of ['展示中','待审核','已失效'] as const)state.append(new Option(reviewing?({'展示中':'通过 · 展示中','待审核':'暂不处理 · 待审核','已失效':'不通过 · 已失效'})[value]!:value,value));state.value=reviewing?'展示中':friend?.status||'展示中';stateLabel.append(state);fields.append(stateLabel)
    if(reviewing&&friend){
      for(const input of [name,url,backlink,rss,avatar,avatarSource,description])input.readOnly=true
      const visit=node('a','打开网站');visit.href=friend.url;visit.target='_blank';visit.rel='noopener noreferrer';visit.dataset.noPopover='true';visit.className='friend-admin-review-link';url.parentElement!.append(visit)
      if(friend.backlinkUrl){const check=node('a','查看本站友链');check.href=friend.backlinkUrl;check.target='_blank';check.rel='noopener noreferrer';check.dataset.noPopover='true';check.className='friend-admin-review-link';backlink.parentElement!.append(check)}
    }
    const footer = node('div', '', 'friend-admin-footer'), submit = node('button', reviewing?'保存审核':'保存友链'); submit.type = 'submit'; submit.className = 'friend-admin-submit'; footer.append(submit)
    form.append(header, fields, footer, status)
    form.onsubmit = async event => {
      event.preventDefault(); validateURL(); if (!form.reportValidity()) return
      const value: FriendLink = { id: friend.id, name: name.value.trim(), url: url.value.trim(), backlinkUrl: backlink.value.trim(), rssUrl:rss.value.trim(), avatar: avatar.value.trim(), avatarSource:avatarSource.value.trim(), description: description.value.trim(), status: state.value as FriendLink["status"], ...(friend?.example ? { example: true } : {}) }
      const path = '/'+friend.id+(reviewing?'/review':'')
      if (await persist(path, 'PUT', reviewing?{status:state.value}:value)) render()
    }
    if(friend?.reviewResult && friend.reviewResult!=='已检测到指向本站的友链，自动审核通过' && !friend.reviewResult.startsWith('人工审核：')){const result=node('p',friend.reviewResult+(friend.reviewCheckedAt?` · ${new Date(friend.reviewCheckedAt).toLocaleString('zh-CN')}`:''),'data-admin-note');header.after(result)}
    root.replaceChildren(form)
  }
  const render = () => {
    if (signal.aborted) return
    const toolbar = node('div', '', 'friend-admin-heading'), refresh=node('button','刷新'); refresh.type = 'button'
    const summary=node('span',`${friends.length} 个站点 · 按最近更新排序`);summary.style.marginRight='auto';toolbar.append(summary,refresh)
    refresh.onclick=async()=>{
      if(busy)return;busy=true
      const controls=[...root.querySelectorAll<HTMLButtonElement>('button')],disabled=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true)
      try{const result=await request('/admin/data/friends');if(!signal.aborted){friends=parseFriends(result.friends);render()}}
      catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'刷新失败',true)}
      finally{busy=false;controls.forEach((control,i)=>control.disabled=disabled[i])}
    }
    const list = node('div', '', 'friend-admin-list')
    friends.forEach(friend => {
      const row = node('div', '', 'friend-admin-row'), avatar = node('span', Array.from(friend.name)[0], 'friend-admin-avatar')
      if((friend.healthFailures||0)>0){row.classList.add('is-unavailable');avatar.classList.add('is-unavailable')}
      if (friend.avatar) { const image = node('img'); image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'strict-origin-when-cross-origin'; image.src = friend.avatar; image.addEventListener('error', () => image.remove(), { once: true, signal }); avatar.append(image) }
      const text = node('div', '', 'friend-admin-copy'),meta=node('div','','friend-admin-meta'),state=node('span',friend.status||'展示中','stellar-admin-badge');state.dataset.state=(friend.healthFailures||0)>0 && (friend.healthFailures||0)<7?'重试中':friend.status||'展示中';if(state.dataset.state==='重试中')state.textContent=`重试中 ${friend.healthFailures}/7`;meta.append(node('small',new URL(friend.url).host),state);if(friend.healthError)meta.append(node('small',friend.healthError));if(friend.latestUpdate)meta.append(node('small',`最近更新 ${new Date(friend.latestUpdate).toLocaleString('zh-CN')}`));const title=node('strong');if(friend.number!==undefined){const number=node('span',`#${String(friend.number).padStart(3,'0')}`,'friend-admin-number');number.setAttribute('aria-label',`编号 ${friend.number}`);title.append(number,document.createTextNode(' '))}title.append(document.createTextNode(friend.name));text.append(title,meta);if(friend.reviewResult && friend.reviewResult!=='已检测到指向本站的友链，自动审核通过' && !friend.reviewResult.startsWith('人工审核：')){const review=node('p',friend.reviewResult,'data-admin-note');review.style.margin='0.35rem 0 0';if(friend.reviewCheckedAt)review.title=`检查于 ${new Date(friend.reviewCheckedAt).toLocaleString('zh-CN')}`;text.append(review)}
      const actions = node('div', '', 'friend-admin-actions')
      const button = (label: string, handler: () => void) => { const item = node('button', label); item.type = 'button'; item.onclick = handler; actions.append(item); return item }
      button('编辑', () => edit(friend))
      button('头像', () => manageAvatar(friend))
      button('审核', () => edit(friend,true)).disabled=friend.status!=='待审核'
      if(friend.status==='待审核')button('自动审核',()=>{void persist('/'+friend.id+'/auto-review','PUT',{}).then(saved=>{if(saved)render()})})
      let confirming = false
      const remove = button('移除', () => { if (!confirming) { confirming = true; remove.textContent = '确认移除'; return }; void persist('/'+friend.id,'DELETE').then(saved => { if (saved) render() }) })
      remove.className = 'is-danger'; row.append(avatar, text, actions); list.append(row)
    })
    if (!friends.length) showAdminListMessage(list, '暂无友链', '在这里审核访客提交的友链申请。')
    root.replaceChildren(toolbar, list, status)
  }
  render()
}
