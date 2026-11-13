import {node} from './driveUi'
type Reply={id:string;mid:string;name:string;avatar:string;message:string;createdAt:number;likes:number;replyCount:number;owner:boolean;pinned:boolean;emotes:Record<string,string>;replies:Reply[]}
type Page={items:Reply[];page:number;pages:number;total:number;hasMore?:boolean;nextCursor?:string}
const imageURL=(raw:string)=>{try{const url=new URL(raw);return url.protocol==='https:'&&url.hostname.endsWith('.hdslb.com')?url.href:''}catch{return ''}}
export function setupBilibiliComments(root:HTMLElement,bvid:string,signal:AbortSignal){
 const list=node('div','','bili-comment-list'),paging=node('nav','','bili-comment-pagination')
 root.append(list,paging);root.classList.add('bili-comments');root.setAttribute('aria-label','Bilibili 评论')
 const cursors=new Map<number,string>([[1,'0']])
 const request=async(page:number,replyRoot='')=>{
  const query=new URLSearchParams({bvid,page:String(page)});if(replyRoot)query.set('root',replyRoot);else query.set('cursor',cursors.get(page)||'0')
  const response=await fetch('/api/video/comments?'+query,{signal,credentials:'omit'}),data=await response.json()
  if(!response.ok)throw Error(data.error||'评论读取失败');if(!replyRoot&&data.nextCursor)cursors.set(page+1,data.nextCursor);return data as Page
 }
 const message=(reply:Reply)=>{
  const body=node('p','','bili-comment-message'),labels=Object.keys(reply.emotes||{}).filter(label=>label.length>0).sort((a,b)=>b.length-a.length)
  const pattern=labels.length?new RegExp('('+labels.map(label=>label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','g'):undefined
  for(const part of pattern?reply.message.split(pattern):[reply.message]){
   const url=imageURL(reply.emotes?.[part]||'')
   if(url){const img=node('img');img.src=url;img.alt=part;img.title=part;img.loading='lazy';img.className='bili-comment-emote';img.referrerPolicy='no-referrer';body.append(img)}else body.append(document.createTextNode(part))
  }
  return body
 }
 const navigation=(host:HTMLElement,value:Page,load:(page:number)=>void)=>{
  host.replaceChildren();if(value.pages<=1)return
  const previous=node('button','上一页'),next=node('button','下一页'),info=node('span',value.hasMore===undefined?`${value.page} / ${value.pages}`:`第 ${value.page} 页`)
  previous.type=next.type='button';previous.disabled=value.page<=1;next.disabled=value.hasMore===undefined?value.page>=value.pages:!value.hasMore;previous.onclick=()=>load(value.page-1);next.onclick=()=>load(value.page+1);host.append(previous,info,next)
 }
 const renderReply=(reply:Reply,nested=false)=>{
  const row=node('article','','bili-comment'+(nested?' is-reply':'')),avatar=node('span',Array.from(reply.name||'?')[0],'bili-comment-avatar'),content=node('div','','bili-comment-content'),meta=node('div','','bili-comment-meta'),name=node('a',reply.name||'Bilibili 用户')
  if(/^[1-9][0-9]*$/.test(reply.mid)){name.href='https://space.bilibili.com/'+reply.mid;name.target='_blank';name.rel='noopener noreferrer';name.dataset.noPopover='true'}
  const src=imageURL(reply.avatar);if(src){const image=node('img');image.src=src;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>image.remove();avatar.append(image)}
  meta.append(name);if(reply.owner)meta.append(node('span','UP','bili-comment-badge bili-comment-up'));if(reply.pinned)meta.append(node('span','置顶','bili-comment-badge'))
  const date=node('time',reply.createdAt?new Date(reply.createdAt*1000).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'');meta.append(date)
  const likes=node('span',`赞 ${reply.likes||0}`,'bili-comment-likes');content.append(meta,message(reply),likes);row.append(avatar,content)
  if(!nested){
   const replies=node('div','','bili-comment-replies');for(const child of reply.replies||[])replies.append(renderReply(child,true));content.append(replies)
   if(reply.replyCount>(reply.replies?.length||0)){
    const more=node('button'),replyPaging=node('nav','','bili-comment-pagination');more.type='button';more.className='bili-comment-more';more.setAttribute('aria-expanded','false');content.append(more,replyPaging)
    let busy=false,expanded=false
    const label=()=>{
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path')
      icon.setAttribute('viewBox','0 0 16 16');icon.setAttribute('aria-hidden','true');icon.classList.add('bili-comment-more-chevron');path.setAttribute('d',expanded?'M4 10 8 6l4 4':'M4 6l4 4 4-4');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.5');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');icon.append(path)
      more.replaceChildren(node('span',expanded?'收起回复':`展开全部 ${reply.replyCount} 条回复`),icon);more.setAttribute('aria-expanded',String(expanded))
    }
    label()
    const preview=()=>{replies.replaceChildren(...(reply.replies||[]).map(item=>renderReply(item,true)));replyPaging.replaceChildren();expanded=false;label();more.onclick=()=>void load(1)}
    const load=async(page:number)=>{if(busy)return;busy=true;more.disabled=true;more.textContent='正在读取回复…';replyPaging.querySelectorAll('button').forEach(button=>button.disabled=true)
     try{const value=await request(page,reply.id);if(signal.aborted)return;replies.replaceChildren(...value.items.map(item=>renderReply(item,true)));navigation(replyPaging,value,p=>void load(p));expanded=true;label();more.onclick=preview}
     catch(error){if(!signal.aborted){more.textContent=(error instanceof Error?error.message:'回复读取失败')+' · 重试';more.onclick=()=>void load(page);replyPaging.querySelectorAll('button').forEach(button=>button.disabled=false)}}
     finally{busy=false;more.disabled=false}
    }
    more.onclick=()=>void load(1)
   }
  }
  return row
 }
 let busy=false
 const load=async(page:number)=>{
  if(busy)return;busy=true;root.setAttribute('aria-busy','true');paging.querySelectorAll('button').forEach(button=>button.disabled=true)
  const status=node('p','正在读取 Bilibili 评论…','bili-comment-status');status.setAttribute('role','status');list.replaceChildren(status)
  try{const value=await request(page);if(signal.aborted)return;list.replaceChildren(...value.items.map(reply=>renderReply(reply)));if(!value.items.length)list.append(node('p','暂无公开评论','bili-comment-status'));navigation(paging,value,p=>void load(p))}
  catch(error){if(!signal.aborted){status.textContent=error instanceof Error?error.message:'评论读取失败';const retry=node('button','重试');retry.type='button';retry.onclick=()=>void load(page);list.append(retry);paging.replaceChildren()}}
  finally{busy=false;root.setAttribute('aria-busy','false')}
 }
 void load(1)
}
