import { invalidateDriveUserCache } from "./driveClient"
import { node } from "./driveUi"
import { adminField, adminPassword, adminSection } from "./driveAdminFields"
import { attachDriveDirectoryPicker } from "./driveDirectoryPicker"
import { adminRoles, userPermissions, type AdminUser } from "./driveAdminModel"
import { setManagementBack, managementSession, managementButton, managementCheck, managementSwitch, readManagementPages, confirmManagement, type ManagementDialog } from "./driveManagementUi"
import { showPasswordToast } from "./passwordFeedback"
export async function setupDriveUserManager(ui: ManagementDialog, parent: AbortSignal, token: string, basePath: string, changed: ()=>Promise<unknown>) {
  const {api,signal}=managementSession(ui,parent,token)
  const toolbar=node("div","","drive-management-toolbar"),status=node("p","正在读取用户…","drive-action-note"),content=node("div","","drive-admin-content")
  ui.body.append(toolbar,status,content);ui.submit.hidden=true;ui.cancel.textContent="关闭"
  let users:AdminUser[]=[],collect:(()=>AdminUser)|undefined,serial=0,busy=false
  const fail=(error:unknown)=>{if(!signal.aborted)ui.fail(error instanceof Error?error.message:"操作失败")}
  const mutation=async(work:()=>Promise<unknown>)=>{
    if(busy||signal.aborted)return;busy=true;ui.clearError();const controls=[...content.querySelectorAll<HTMLButtonElement>("button")];controls.forEach(button=>button.disabled=true)
    try{await work();invalidateDriveUserCache();await refresh();await changed()}finally{busy=false;controls.forEach(button=>button.disabled=false)}
  }
  const confirm=(title:string,message:string,work:()=>Promise<unknown>)=>confirmManagement(title,message,signal,()=>mutation(work))
  const listView=()=>{
    serial++;setManagementBack(ui);toolbar.hidden=false;status.hidden=false;collect=undefined;ui.submit.hidden=true;ui.clearError();status.textContent=`共 ${users.length} 个用户`
    toolbar.replaceChildren(managementButton("新增用户",()=>edit({id:0,username:"",password:"",base_path:basePath||"/",role:0,permission:0,disabled:false,allow_ldap:false,sso_id:""})),managementButton("刷新",()=>void refresh().catch(fail)))
    content.replaceChildren()
    for(const user of [...users].sort((a,b)=>a.role===2?-1:b.role===2?1:a.username.localeCompare(b.username,"zh-CN"))){
      const row=node("article","","drive-admin-row"),text=node("div","","drive-admin-row-info"),actions=node("div","","drive-management-actions")
      text.append(node("strong",user.username),node("p",`${adminRoles[user.role]||user.role} · ${user.disabled?"已禁用":"已启用"} · ${user.base_path}`,"drive-action-note"))
      if(user.role!==2){
        const toggle=managementSwitch(`启用用户 ${user.username}`,!user.disabled)
        toggle.input.addEventListener("change",()=>{
          if(busy){toggle.input.checked=!user.disabled;toggle.update();return}
          const enabled=toggle.input.checked;toggle.input.disabled=true
          void mutation(async()=>{const record=await api<AdminUser>(`admin/user/get?id=${user.id}`);await api("admin/user/update",{...record,password:"",disabled:!enabled})})
            .catch(error=>{toggle.input.checked=!enabled;toggle.update();fail(error)}).finally(()=>{toggle.input.disabled=false})
        },{signal})
        actions.append(toggle.wrapper)
      }
      actions.append(managementButton("编辑",()=>void openUser(user.id)),managementButton("清除缓存",()=>confirm("清除用户缓存",`确认清除 ${user.username} 的用户缓存？`,()=>api(`admin/user/del_cache?username=${encodeURIComponent(user.username)}`,{}))),managementButton("取消两步验证",()=>confirm("取消两步验证",`确认取消 ${user.username} 的两步验证？`,()=>api(`admin/user/cancel_2fa?id=${user.id}`,{}))))
      if(user.role!==2)actions.append(managementButton("删除",()=>confirm("删除用户",`确认删除用户 ${user.username}？`,()=>api(`admin/user/delete?id=${user.id}`,{})),true))
      row.append(text,actions);content.append(row)
    }
    if(!users.length)content.append(node("p","暂无用户","drive-action-note"))
  }
  const refresh=async()=>{const request=++serial;const result=await readManagementPages<AdminUser>(api,"admin/user/list");if(!signal.aborted&&request===serial){users=result;listView()}}
  const openUser=async(id:number)=>{const request=++serial;status.textContent="正在读取用户…";try{const user=await api<AdminUser>(`admin/user/get?id=${id}`);if(!signal.aborted&&request===serial)edit(user)}catch(error){fail(error)}}
  const edit=(record:AdminUser)=>{
    serial++;ui.clearError();status.textContent="";status.hidden=true;ui.submit.hidden=false;ui.submit.textContent=record.id?"保存修改":"新增"
    toolbar.replaceChildren();toolbar.hidden=true;setManagementBack(ui,listView);content.replaceChildren()
    const fields=node("div","","drive-admin-fields"),account=adminSection(fields,"账户"),access=adminSection(fields,"目录与登录"),permissions=adminSection(fields,"操作权限")
    let username:HTMLInputElement|undefined,password:HTMLInputElement|undefined
    if(record.role!==1){username=adminField(account,"用户名",record.username);username.required=true;password=adminPassword(account,record.id?"新密码（留空保持不变）":"密码");password.required=!record.id}
    else account.append(node("p","GUEST","drive-action-note"))
    const path=adminField(access,"用户根目录",record.base_path||"/");path.required=true;attachDriveDirectoryPicker(path,{signal,token,absolute:true,basePath})
    const sso=adminField(access,"SSO ID",record.sso_id||""),ldap=managementCheck("允许 LDAP 登录",Boolean(record.allow_ldap)),disabled=managementCheck("禁用用户",Boolean(record.disabled))
    disabled.input.disabled=record.role===2;access.append(ldap.wrapper,disabled.wrapper)
    const checks=userPermissions.map((name,bit)=>{const check=managementCheck(name,Boolean((record.permission||0)&(1<<bit)));permissions.append(check.wrapper);return check.input})
    content.append(fields)
    collect=()=>{
      const value=path.value.trim();if(!value.startsWith("/")||value.split("/").some(part=>part===".."||part==="."))throw new Error("请输入有效的用户根目录")
      let permission=record.permission||0;checks.forEach((input,bit)=>{permission=input.checked?permission|(1<<bit):permission&~(1<<bit)})
      return {...record,username:username?.value.trim()||record.username,password:password?.value||"",base_path:value.replace(/\/$/,"")||"/",permission,sso_id:sso.value,allow_ldap:ldap.input.checked,disabled:record.role===2?record.disabled:disabled.input.checked}
    }
  }
  ui.run(async()=>{if(!collect)throw new Error("请选择用户");const draft=collect();await api(`admin/user/${draft.id?"update":"create"}`,draft);invalidateDriveUserCache();await changed();await refresh();showPasswordToast("用户已保存")}, { closeOnSuccess: false })
  try{await refresh()}catch(error){fail(error);status.textContent="";toolbar.replaceChildren(managementButton("重试",()=>void refresh().catch(fail)))}
}
