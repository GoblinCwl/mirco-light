import { repoEscape as e } from './repoShared'
export type Activity={id:string;label:string;text:string;date:string;href?:string;url?:string;repository?:string;bvid?:string;kind?:string}
export function activityTimelineTime(value:string,now=Date.now()) {
  const date=new Date(value),elapsed=now-date.getTime()
  if(!Number.isFinite(elapsed))return ''
  if(elapsed>=0&&elapsed<30*86400000){
    if(elapsed<60000)return '刚刚'
    if(elapsed<3600000)return `${Math.floor(elapsed/60000)}分钟前`
    if(elapsed<86400000)return `${Math.floor(elapsed/3600000)}小时前`
    return `${Math.floor(elapsed/86400000)}天前`
  }
  return date.toLocaleDateString('zh-CN',{year:'numeric',month:'numeric',day:'numeric'})
}
export function activityTimeline(title:string,items:Activity[]) {
  const now=Date.now()
  const icons={video:'<path d="m10 8 6 4-6 4Z"/><rect x="3" y="4" width="18" height="16" rx="3"/>',code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',repository:'<path d="M4 3h14v18H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h14M7 7h7"/>',issue:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>',post:'<path d="M4 4h16v16H4Zm4 5h8m-8 5h5"/>'}
  const render=(item:Activity)=>{
    const text=item.repository?`${item.repository.split('/').slice(1).join('/')}${item.text?' · '+item.text:''}`:item.text
    const date=new Date(item.date),valid=Number.isFinite(date.getTime()),time=activityTimelineTime(item.date,now)
    const icon=item.kind==='repository'?icons.repository:item.kind==='issue'?icons.issue:item.repository?icons.code:item.bvid?icons.video:icons.post
    return `<li><div class="platform-activity-meta"><span>${e(item.label)}</span><time${valid?` datetime="${e(date.toISOString())}" title="${e(date.toLocaleString('zh-CN'))}"`: ''}>${e(time)}</time></div><div class="platform-activity-entry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>${item.href?`<a href="${e(item.href)}" data-no-popover="true"${/^https:/.test(item.href)?' target="_blank" rel="noopener noreferrer" data-router-ignore="true"':''}>${e(text)}</a>`:`<p>${e(text)}</p>`}</div></li>`
  }
  const rows=items.map(render).join('')||'<li class="platform-activity-empty">暂无公开动态</li>'
  const body=`<div class="platform-activity-body"><ol class="platform-activity">${rows}</ol></div><button type="button" class="platform-activity-toggle" aria-expanded="false" hidden><span>展开更多</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`
  return `<section class="platform-activity-module" data-platform-activity aria-label="${e(title)}">${body}</section>`
}
