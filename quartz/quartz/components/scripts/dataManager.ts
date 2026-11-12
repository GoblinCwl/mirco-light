import {renderAdminPagination} from "./adminPagination"
import {node} from './driveUi'
import {showPasswordToast} from './passwordFeedback'
import {showAdminListMessage} from './adminListState'
type Field={name:string;label:string;type:'text'|'number'|'file';required:boolean;primary:number;default:string|null}
type Table={id:string;group:string;title:string;fields:Field[];limit?:number}
type Key=Record<string,string|number>
type Row={key:Key;values:Record<string,unknown>}
type Request=(path:string,init?:RequestInit)=>Promise<any>
const automaticField=(table:Table,name:string)=>table.id==='friends'&&name==='number'||['created_at','fetched_at','completed_at'].includes(name)||name==='id'&&['friends','feedback','journal','repo-avatar','content-index'].includes(table.id)||table.id==='visitors'&&['identity','meteor_id','first_seen','last_seen'].includes(name)
const names:Record<string,string[]>={friends:['展示中','待审核','已失效'],feedback:['待处理','已解决'],journal:['content','site','service'],content:['article','share','repo','video']}
export function setupDataManager(root:HTMLElement,signal:AbortSignal,request:Request){
 let tables:Table[]=[],current:Table|undefined,page=1,query='',version=0,timer:ReturnType<typeof setTimeout>|undefined
 const modules=node('div','','data-admin-tabs data-admin-module-tabs'),categories=node('div','','data-admin-tabs data-admin-table-tabs'),toolbar=node('div','','data-admin-toolbar'),search=node('input'),add=node('button','新增记录'),body=node('div','','data-admin-body'),footer=node('div','','stellar-admin-pagination')
 modules.setAttribute('aria-label','数据模块');categories.setAttribute('aria-label','数据类别');search.type='search';search.placeholder='查找当前数据';search.setAttribute('aria-label','搜索数据');add.type='button';add.className='stellar-admin-add';toolbar.append(search,add);root.append(modules,categories,node('p','仅维护本站记录，不会改动上游平台；视频和仓库缓存会随后续同步更新。','data-admin-note'),toolbar,body,footer)
 signal.addEventListener('abort',()=>{clearTimeout(timer);version++},{once:true})
 const endpoint=()=>`/admin/data/tables/${current!.id}`
 const changed=(id=current!.id)=>{document.dispatchEvent(new CustomEvent('stellar-data-changed',{detail:{table:id}}));if(id==='friends')document.dispatchEvent(new Event('friends-changed'))}
 const edit=async(key?:Key)=>{
  if(!current)return
  const table=current,tableEndpoint=`/admin/data/tables/${table.id}`,ticket=++version;body.setAttribute('aria-busy','true')
  try{
   const value:Record<string,any>=key?(await request(tableEndpoint+'?key='+encodeURIComponent(JSON.stringify(key)))).record:{}
   if(signal.aborted||ticket!==version)return
   const form=node('form','','data-admin-form'),header=node('div','','friend-admin-heading'),back=node('button','返回列表'),fields=node('div','','data-admin-fields'),save=node('button',key?'保存修改':'新增记录'),controls=new Map<string,HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(),uploads=new Map<string,File>()
   header.append(node('h3',`${key?'编辑':'新增'}${table.title}`),back);back.type='button';back.onclick=()=>void load();save.type='submit';save.className='friend-admin-submit';fields.setAttribute('aria-label',table.title)
   for(const field of table.fields.filter(field=>!['example','source_key'].includes(field.name)&&!(['search_text','revision'].includes(field.name)&&table.id==='content-index'))){
    if(table.id==='friends'&&field.name==='review_result'&&(value[field.name]==='已检测到指向本站的友链，自动审核通过'||String(value[field.name]||'').startsWith('人工审核：')))continue
    const label=node('label','','data-admin-field'),caption=node('span',field.label);label.append(caption)
    if(field.type==='file'){
     const input=node('input');input.type='file';input.accept='image/png,image/jpeg,image/gif,image/webp,image/avif';input.setAttribute('aria-label',field.label)
     input.onchange=()=>{const file=input.files?.[0];if(file&&file.size>512*1024){showPasswordToast('图片不能超过 512 KB',true);input.value='';uploads.delete(field.name);return}if(file)uploads.set(field.name,file);else uploads.delete(field.name)}
     if(value[field.name]?.blob){const link=node('a',`下载当前图片 · ${Math.ceil(value[field.name].bytes/1024)} KB`);link.href=tableEndpoint+'/blob?column='+encodeURIComponent(field.name)+'&key='+encodeURIComponent(JSON.stringify(key));link.target='_blank';link.rel='noopener';link.dataset.routerIgnore='true';label.append(link)}
     label.append(input);fields.append(label);continue
    }
    let input:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement
    const options=field.name==='status'?names[table.id]:field.name==='kind'&&table.id==='journal'?names.journal:field.name==='type'&&table.id==='content-index'?names.content:undefined
    if(options){const choose=node('select');for(const name of options)choose.append(new Option(({content:'内容更新',site:'站点更新',service:'服务恢复'} as Record<string,string>)[name]||name,name));input=choose}
    else if(['value','payload','description','geo_raw','content','tags','links','extra','added','removed'].includes(field.name)){const area=node('textarea');area.rows=['value','payload','geo_raw'].includes(field.name)?10:4;label.classList.add('is-wide');input=area}
    else{const entry=node('input');entry.type=field.type==='number'?'number':'text';if(field.type==='number')entry.step='any';input=entry}
    let text=value[field.name]
    if(!key&&text===undefined){if(table.id==='content-index'&&['tags','links'].includes(field.name))text='[]';else if(table.id==='content-index'&&field.name==='extra')text='{}';else if(table.id==='content-index'&&field.name==='type')text='article';else if(field.name==='status'&&options)text=options[0];else if(field.name==='kind')text='content';else if(field.default!=null)text=field.default.replace(/^'|'$/g,'');else if(field.type==='number'&&!field.primary&&!automaticField(table,field.name))text=0}
    if(typeof text==='string'&&['value','payload','geo_raw'].includes(field.name)){try{const json=JSON.parse(text);if(json&&typeof json==='object')text=JSON.stringify(json,null,2)}catch{}}
    input.value=text==null?'':String(text);input.setAttribute('aria-label',field.label);input.disabled=!!key&&!!field.primary
    if(table.id==='friends'&&field.name==='number'&&input instanceof HTMLInputElement){input.min='1';input.max='4294967295';input.step='1'}
    if(table.id==='friends'&&field.name==='backlink_url'&&input instanceof HTMLInputElement){input.type='url';input.pattern='[Hh][Tt][Tt][Pp][Ss]://.+';input.placeholder='https://example.com/friends';input.title='请填写包含本站友链的页面 HTTPS 地址';input.maxLength=1500}
    if(table.id==='friends'&&field.name==='rss_url'&&input instanceof HTMLInputElement){input.type='url';input.required=false;input.maxLength=1500;input.pattern='[Hh][Tt][Tt][Pp][Ss]?://.+';input.placeholder='排序依据：https://example.com/feed.xml'}
    if(table.id==='friends'&&field.name==='avatar_source'&&input instanceof HTMLInputElement){input.type='url';input.maxLength=1500;input.pattern='[Hh][Tt][Tt][Pp][Ss]?://.+';input.placeholder='选填：远程头像地址，每日 06:00 检查'}
    if(table.id==='friends'&&['latest_update','review_result','review_checked_at','health_failures','health_checked_on','health_error'].includes(field.name)&&input instanceof HTMLInputElement){input.readOnly=true;input.placeholder=field.name.startsWith('health_')?'由每日首页检查维护':field.name==='latest_update'?'由每日 RSS 任务更新':'由审核流程维护'}
    const automatic=automaticField(table,field.name)
    input.required=table.id==='friends'&&field.name==='backlink_url'||field.required&&field.default==null&&!(automatic&&!key)&&!(table.id==='content-index'&&['content','description','event_revision'].includes(field.name))
    if(automatic&&!key&&!(input instanceof HTMLSelectElement))input.placeholder='留空自动生成'
    controls.set(field.name,input);label.append(input);fields.append(label)
   }
   const actions=node('div','','friend-admin-footer');actions.append(save);form.append(header,fields,actions);body.replaceChildren(form);footer.replaceChildren();toolbar.hidden=true
   form.onsubmit=async event=>{
    event.preventDefault();if(save.disabled)return
    const values:Record<string,unknown>={};for(const field of table.fields){const input=controls.get(field.name);if(!input)continue;if(key&&field.primary)continue;if(table.id==='friends'&&['latest_update','review_result','review_checked_at','health_failures','health_checked_on','health_error'].includes(field.name))continue;if(!key&&!input.value.trim()&&(field.default!=null||automaticField(table,field.name)))continue;values[field.name]=field.type==='number'?(input.value===''?null:Number(input.value)):input.value===''&&!field.required?null:input.value}
    const fieldsToDisable=[...form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>('input,select,textarea,button')],disabled=fieldsToDisable.map(field=>field.disabled)
    fieldsToDisable.forEach(field=>field.disabled=true)
    try{
     for(const [name,file]of uploads){const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));values[name]={base64:btoa(raw)};if(table.fields.some(field=>field.name==='mime'))values.mime=file.type}
     await request(tableEndpoint+(key?'?key='+encodeURIComponent(JSON.stringify(key)):''),{method:key?'PUT':'POST',body:JSON.stringify({values})})
     if(!signal.aborted){showPasswordToast(key?'记录已保存':'记录已新增');changed(table.id);await load()}
    }catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'保存失败',true)}finally{fieldsToDisable.forEach((field,index)=>field.disabled=disabled[index])}
   }
  }catch(error){if(!signal.aborted&&ticket===version)showPasswordToast(error instanceof Error?error.message:'记录读取失败',true)}finally{if(ticket===version)body.removeAttribute('aria-busy')}
 }
 const load=async()=>{
  if(!current)return
  const ticket=++version;toolbar.hidden=false;footer.replaceChildren();body.setAttribute('aria-busy','true');const loading=node('div','','data-admin-loading'),spinner=node('span','','drive-loading');spinner.setAttribute('aria-label','正在读取数据');spinner.setAttribute('role','status');spinner.append(node('i'));loading.append(spinner);body.replaceChildren(loading)
  try{
   const result:{page:number;pages:number;total:number;records:Row[]}=await request(endpoint()+`?page=${page}&query=${encodeURIComponent(query)}`)
   if(signal.aborted||ticket!==version)return
   page=result.page;const wrap=node('div','','data-admin-table-wrap'),table=node('table','','data-admin-table'),head=node('thead'),titles=node('tr'),rows=node('tbody')
   const previews:Record<string,string[]>={'content-index':['title','type','updated_at'],friends:['number','name','url','status','latest_update'],feedback:['email','description','status','created_at'],visitors:['meteor_id','region','browser','last_seen'],'daily-visitors':['day','identity'],videos:['title','bvid','published_at','play'],'video-meta':['key','value'],'repo-snapshots':['key','value'],journal:['kind','completed_at','payload']}
   const columns=(previews[current.id]||current.fields.filter(field=>!['data','geo_raw','geo_error','user_agent','etag','hash','example'].includes(field.name)).slice(0,5).map(field=>field.name)).map(name=>current!.fields.find(field=>field.name===name)!).filter(Boolean)
   for(const field of columns)titles.append(node('th',field.label));titles.append(node('th','操作'));head.append(titles)
   for(const record of result.records){const row=node('tr');for(const field of columns){const value=record.values[field.name],text=value==null?'—':typeof value==='object'?'图片文件':field.name==='latest_update'&&value?new Date(String(value)).toLocaleString('zh-CN'):value===''?'—':String(value),cell=node('td'),content=node('span',text);content.title=text;cell.append(content);row.append(cell)}
    const actions=node('td','','data-admin-row-actions'),change=node('button','编辑'),remove=node('button','删除');change.type=remove.type='button';remove.className='is-danger';change.onclick=()=>void edit(record.key);let confirming=false
    remove.onclick=async()=>{if(!confirming){confirming=true;remove.textContent='确认删除';return}remove.disabled=change.disabled=true;try{await request(endpoint()+'?key='+encodeURIComponent(JSON.stringify(record.key)),{method:'DELETE'});if(!signal.aborted){showPasswordToast('记录已删除');changed();await load()}}catch(error){showPasswordToast(error instanceof Error?error.message:'删除失败',true);remove.disabled=change.disabled=false}}
    actions.append(change,remove);row.append(actions);rows.append(row)
   }
   table.append(head,rows);wrap.append(table);body.replaceChildren(wrap)
   if(!result.records.length)showAdminListMessage(body,query?'没有匹配记录':'暂无数据',query?'尝试其他关键词。':'可以新增记录或使用对应模块的同步功能。')
   renderAdminPagination(footer,page,result.pages,result.total,value=>{page=value;void load()},current.limit?'最多保留 '+current.limit+' 条':'')
  }catch(error){if(!signal.aborted){showPasswordToast(error instanceof Error?error.message:'数据读取失败',true);showAdminListMessage(body,'数据维护','点击重试读取记录。',()=>void load())}}finally{if(ticket===version)body.removeAttribute('aria-busy')}
 }
 root.addEventListener('data-refresh',()=>void load(),{signal})
 search.oninput=()=>{query=search.value;page=1;clearTimeout(timer);timer=setTimeout(()=>void load(),300)};add.onclick=()=>void edit()
 void request('/admin/data/tables').then(result=>{
  if(signal.aborted)return;tables=result.tables
  const groups=new Map<string,Table[]>();for(const table of tables){const entries=groups.get(table.group)||[];entries.push(table);groups.set(table.group,entries)}
  const moduleButtons=new Map<string,HTMLButtonElement>()
  const selectTable=(table:Table)=>{clearTimeout(timer);current=table;page=1;query='';search.value='';for(const button of categories.querySelectorAll<HTMLButtonElement>('button'))button.setAttribute('aria-pressed',String(button.dataset.table===table.id));void load()}
  const selectGroup=(name:string)=>{
   for(const [group,button]of moduleButtons)button.setAttribute('aria-pressed',String(group===name))
   categories.replaceChildren();const entries=groups.get(name)||[]
   for(const table of entries){const button=node('button',table.title);button.type='button';button.dataset.table=table.id;button.onclick=()=>selectTable(table);categories.append(button)}
   if(entries[0])selectTable(entries[0])
  }
  for(const name of groups.keys()){const button=node('button',name);button.type='button';button.setAttribute('aria-pressed','false');button.onclick=()=>selectGroup(name);moduleButtons.set(name,button);modules.append(button)}
  const first=groups.keys().next().value;if(first)selectGroup(first);else showAdminListMessage(body,'暂无已初始化的数据源','数据产生后会显示在这里。')
 }).catch(error=>{if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'数据类别读取失败',true)})
}
