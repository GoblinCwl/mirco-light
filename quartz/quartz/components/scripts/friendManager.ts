import {showPasswordToast} from './passwordFeedback'
import {showAdminListMessage} from './adminListState'
import { defaultFriends, parseFriends, type FriendLink } from '../../util/friends.mjs'
import { node } from './driveUi'

export function setupFriendManager(root: HTMLElement, initial: unknown, signal: AbortSignal, request: (path: string, init?: RequestInit) => Promise<{friends: FriendLink[]}>) {
  let friends: FriendLink[]
  try { friends = parseFriends(initial ?? defaultFriends) } catch { friends = [] }
  let busy = false
  const status = node('p', '', 'friend-admin-status'); status.setAttribute('role', 'status')
  const persist = async (path: string, method: string, value?: unknown) => {
    if (busy || signal.aborted) return false
    busy = true; status.textContent = ''; status.classList.remove('is-error')
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement | HTMLSelectElement>('input,button,textarea,select')]
    const disabled = controls.map(control => control.disabled); controls.forEach(control => control.disabled = true)
    try { const result = await request('/admin/data/friends'+path, {method, ...(value === undefined ? {} : {body:JSON.stringify(value)})}); if (signal.aborted) return false; friends = parseFriends(result.friends); document.dispatchEvent(new Event('friends-changed')); showPasswordToast(method==='DELETE'?'已删除':'已保存'); return true }
    catch (error) { if (!signal.aborted) { showPasswordToast(error instanceof Error ? error.message : '保存失败',true) }; return false }
    finally { busy = false; controls.forEach((control, i) => control.disabled = disabled[i]) }
  }
  const edit = (friend?: FriendLink, reviewing=false) => {
    status.textContent = ''; status.classList.remove('is-error')
    const form = node('form', '', 'friend-admin-form'), header = node('header', '', 'friend-admin-heading'), back = node('button', '返回列表')
    back.type = 'button'; back.onclick = render; header.append(node('h3', reviewing ? '审核友链' : friend ? '编辑友链' : '新增友链'), back)
    const fields = node('div', '', 'friend-admin-fields')
    const field = (title: string, value: string, type = 'text') => {
      const label = node('label', title), input = node('input'); input.type = type; input.value = value; label.append(input); fields.append(label); return input
    }
    const name = field('站点名称', friend?.name || ''); name.required = true; name.maxLength = 80; name.autocomplete = 'off'
    const url = field('网站链接', friend?.url || '', 'url'); url.required = true; url.maxLength = 1500; url.placeholder = 'https://'
    const avatar = field('头像链接', friend?.avatar || ''); avatar.maxLength = 1500; avatar.placeholder = '图片地址，留空使用名称首字'; avatar.parentElement!.classList.add('is-wide')
    const descriptionLabel = node('label', '站点简介'), description = node('textarea'); description.value = friend?.description || ''; description.rows = 3; description.maxLength = 300
    descriptionLabel.className = 'is-wide'; descriptionLabel.append(description); fields.append(descriptionLabel)
    const stateLabel=node('label',reviewing?'审核结果':'状态'),state=node('select');for(const value of ['展示中','待审核','已失效'] as const)state.append(new Option(reviewing?({'展示中':'通过 · 展示中','待审核':'暂不处理 · 待审核','已失效':'不通过 · 已失效'})[value]!:value,value));state.value=reviewing?'展示中':friend?.status||'展示中';stateLabel.append(state);fields.append(stateLabel)
    if(reviewing&&friend){
      for(const input of [name,url,avatar,description])input.readOnly=true
      const visit=node('a','打开网站');visit.href=friend.url;visit.target='_blank';visit.rel='noopener noreferrer';visit.dataset.noPopover='true';visit.className='friend-admin-review-link';url.parentElement!.append(visit)
    }
    const footer = node('div', '', 'friend-admin-footer'), submit = node('button', reviewing?'保存审核':'保存友链'); submit.type = 'submit'; submit.className = 'friend-admin-submit'; footer.append(submit)
    form.append(header, fields, footer, status)
    form.onsubmit = async event => {
      event.preventDefault(); if (!form.reportValidity()) return
      const value: FriendLink = { id: friend?.id || crypto.randomUUID(), name: name.value.trim(), url: url.value.trim(), avatar: avatar.value.trim(), description: description.value.trim(), status: state.value as FriendLink["status"], ...(friend?.example ? { example: true } : {}) }
      const path = friend ? '/'+friend.id+(reviewing?'/review':'') : ''
      if (await persist(path, friend?'PUT':'POST', reviewing?{status:state.value}:value)) render()
    }
    root.replaceChildren(form)
  }
  const render = () => {
    if (signal.aborted) return
    const toolbar = node('div', '', 'friend-admin-heading'), add = node('button', '添加友链'); add.type = 'button'; add.className='stellar-admin-add'; add.onclick = () => edit(); toolbar.append(node('span', `${friends.length} 个站点`), add)
    const list = node('div', '', 'friend-admin-list')
    friends.forEach((friend, index) => {
      const row = node('div', '', 'friend-admin-row'), avatar = node('span', Array.from(friend.name)[0], 'friend-admin-avatar')
      if (friend.avatar) { const image = node('img'); image.src = friend.avatar; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.addEventListener('error', () => image.remove(), { once: true, signal }); avatar.append(image) }
      const text = node('div', '', 'friend-admin-copy'),meta=node('div','','friend-admin-meta'),state=node('span',friend.status||'展示中','stellar-admin-badge');state.dataset.state=friend.status||'展示中';meta.append(node('small',new URL(friend.url).host),state);text.append(node('strong', friend.name),meta)
      const actions = node('div', '', 'friend-admin-actions')
      const button = (label: string, handler: () => void) => { const item = node('button', label); item.type = 'button'; item.onclick = handler; actions.append(item); return item }
      button('编辑', () => edit(friend))
      button('审核', () => edit(friend,true)).disabled=friend.status!=='待审核'
      const move = async (offset: number) => { if (await persist('/'+friend.id+'/move','PUT',{offset})) render() }
      button('前移', () => void move(-1)).disabled = index === 0
      button('后移', () => void move(1)).disabled = index === friends.length - 1
      let confirming = false
      const remove = button('移除', () => { if (!confirming) { confirming = true; remove.textContent = '确认移除'; return }; void persist('/'+friend.id,'DELETE').then(saved => { if (saved) render() }) })
      remove.className = 'is-danger'; row.append(avatar, text, actions); list.append(row)
    })
    if (!friends.length) showAdminListMessage(list, '暂无友链', '添加站点，或在这里审核访客提交的友链申请。')
    root.replaceChildren(toolbar, list, status)
  }
  render()
}
