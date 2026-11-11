import {node} from './driveUi'
import {showPasswordToast} from './passwordFeedback'
import {adminPassword} from './driveAdminFields'
type Credential={value?:string;configured:boolean;status:string;checkedAt:string|null}
export function setupUpstreamManager(root:HTMLElement,signal:AbortSignal,request:(path:string,init?:RequestInit)=>Promise<any>){
 const labels:Record<string,string>={valid:'连接正常',expired:'凭据已过期',unavailable:'暂时无法验证',unchecked:'尚未检测',not_configured:'未配置'},loading=request('/admin/upstreams')
 for(const[id,title,label,description]of[
  ['github','GitHub','Token','用于仓库同步、发布版本和公开活动，保存后由服务读取。'],
  ['bilibili','Bilibili','Cookie','填写包含 SESSDATA 的完整 Cookie；保存后自动同步，过期时在此替换。'],
 ]){
  const card=node('section','','stellar-setting-card'),form=node('form','','stellar-setting-row'),copy=node('div','','stellar-setting-copy'),caption=node('label',label),help=node('small',description),controls=node('div','','stellar-setting-control'),password=node('div','','stellar-setting-password'),input=adminPassword(password,label,'',true),save=node('button','保存'),check=node('button','检测'),status=node('span','','stellar-setting-status')
  form.noValidate=true;form.dataset.fieldType='password';input.maxLength=16384;input.placeholder='输入新凭据';input.id=`upstream-${id}`;caption.htmlFor=input.id;help.id=`${input.id}-help`;input.setAttribute('aria-describedby',help.id);save.type='submit';save.disabled=true;check.type='button';check.disabled=true
  copy.append(caption,help);controls.append(password,check,save);form.append(copy,controls,status);card.append(node('h3',title),form);root.append(card)
  let busy=false,configured=false,savedValue=''
  const update=()=>{input.disabled=busy;save.disabled=busy||!input.value.trim()||input.value===savedValue;check.disabled=busy||!configured;form.classList.toggle('is-dirty',Boolean(input.value.trim())&&input.value!==savedValue)}
  const render=(value:Credential)=>{configured=value.configured;if(typeof value.value==='string'){savedValue=value.value;input.value=savedValue}status.textContent='';check.title=(labels[value.status]||'尚未检测')+(value.checkedAt?` · 检测于 ${new Date(value.checkedAt).toLocaleString('zh-CN')}`:'');input.placeholder=configured?'已配置，输入新值以替换':'输入新凭据';update()}
  const act=async(replace:boolean)=>{
   if(busy)return;busy=true;update();const button=replace?save:check;button.textContent=replace?'保存中':'检测中'
   try{const value:Credential=await request(`/admin/upstreams/${id}${replace?'':'/verify'}`,{method:replace?'PUT':'POST',...(replace?{body:JSON.stringify({value:input.value})}:{})});if(signal.aborted)return;if(replace)savedValue=input.value;render(value);showPasswordToast(value.status==='valid'?(replace?'凭据已保存，验证通过':'凭据验证通过'):value.status==='expired'?'凭据已过期，请替换':replace?'已保存，平台暂时无法验证，可稍后重试':'平台暂时无法验证，请稍后重试',value.status!=='valid')}
   catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'操作失败',true)}
   finally{busy=false;button.textContent=replace?'保存':'检测';update()}
  }
  input.addEventListener('input',update,{signal});form.addEventListener('submit',event=>{event.preventDefault();if(!save.disabled)void act(true)},{signal});check.addEventListener('click',()=>void act(false),{signal})
  void loading.then(value=>{if(!signal.aborted)render(value[id])}).catch(error=>{if(!signal.aborted){status.textContent='';showPasswordToast(error.message,true)}})
  signal.addEventListener('abort',()=>{input.value=''}, {once:true})
 }
}
