import { createDriveDriverPicker } from "./driveDriverPicker"
import { node } from "./driveUi"
import { adminField, adminPassword, adminSection } from "./driveAdminFields"
import { attachDriveDirectoryPicker } from "./driveDirectoryPicker"
import { driverDefault, parseStorageAddition, type AdminStorage, type DriverInfo, type DriverItem } from "./driveAdminModel"
import { setManagementBack, managementSession, managementButton, managementCheck, managementSwitch, readManagementPages, confirmManagement, type ManagementDialog } from "./driveManagementUi"
import { showPasswordToast } from "./passwordFeedback"
const labels:Record<string,string>={mount_path:"挂载路径",order:"排序",cache_expiration:"缓存过期时间",custom_cache_policies:"自定义缓存策略",remark:"备注",web_proxy:"网页代理",webdav_policy:"WebDAV 策略",proxy_range:"代理 Range",down_proxy_url:"下载代理地址",disable_proxy_sign:"禁用代理签名",order_by:"文件排序字段",order_direction:"排序方向",extract_folder:"文件夹排序位置",enable_sign:"启用签名",disable_index:"禁用索引",root_folder_path:"根目录路径",root_folder_id:"根目录 ID",endpoint:"服务端点",bucket:"存储桶",region:"区域",access_key_id:"Access Key ID",secret_access_key:"Secret Access Key",access_token:"Access Token",refresh_token:"Refresh Token",username:"用户名",password:"密码",url:"地址",host:"主机",port:"端口",client_id:"Client ID",client_secret:"Client Secret",cookie:"Cookie",seed_policy:"种子策略"}
const optionLabels:Record<string,string>={name:"名称",size:"大小",modified:"修改时间",ASC:"升序",DESC:"降序",front:"置前",back:"置后","302_redirect":"直接跳转",use_proxy_url:"使用代理地址",native_proxy:"本机代理",inherit:"继承",on:"开启",off:"关闭"}
export async function setupDriveStorageManager(ui:ManagementDialog,parent:AbortSignal,token:string,basePath:string,changed:()=>Promise<unknown>){
  const {api,signal}=managementSession(ui,parent,token)
  const toolbar=node("div","","drive-management-toolbar"),status=node("p","正在读取存储…","drive-action-note"),content=node("div","","drive-admin-content")
  ui.body.append(toolbar,status,content);ui.submit.hidden=true;ui.cancel.textContent="关闭"
  let storages:AdminStorage[]=[],drivers:Record<string,DriverInfo>={},collect:(()=>AdminStorage)|undefined,serial=0,busy=false
  const fail=(error:unknown)=>{if(!signal.aborted)ui.fail(error instanceof Error?error.message:"操作失败")}
  const mutation=async(work:()=>Promise<unknown>)=>{if(busy||signal.aborted)return;busy=true;ui.clearError();const buttons=[...content.querySelectorAll<HTMLButtonElement>("button"),...toolbar.querySelectorAll<HTMLButtonElement>("button")];buttons.forEach(button=>button.disabled=true);try{await work();await refresh();await changed()}finally{busy=false;buttons.forEach(button=>button.disabled=false)}}
  const confirm=(title:string,message:string,work:()=>Promise<unknown>)=>confirmManagement(title,message,signal,()=>mutation(work))
  const listView=()=>{
    serial++;setManagementBack(ui);toolbar.hidden=false;status.hidden=false;collect=undefined;ui.submit.hidden=true;ui.clearError();status.textContent=`共 ${storages.length} 个存储`
    const add=managementButton("新增存储",()=>edit({id:0,mount_path:"",driver:Object.keys(drivers).sort()[0]||"",addition:"{}",disabled:false,status:"",order:0}))
    toolbar.replaceChildren(add,managementButton("刷新",()=>void refresh().catch(fail)),managementButton("重新加载全部",()=>confirm("重新加载全部存储","确认重新加载所有存储？",()=>api("admin/storage/load_all",{}))))
    content.replaceChildren();const filterLabel=node("label","驱动筛选"),filter=node("select");filter.setAttribute("aria-label","驱动筛选")
    const all=node("option","全部驱动");all.value="";filter.append(all)
    for(const driver of [...new Set(storages.map(storage=>storage.driver))].sort()){const option=node("option",driver);option.value=driver;filter.append(option)}
    filterLabel.append(filter);const rows=node("div","","drive-admin-list");content.append(filterLabel,rows)
    const render=()=>{
      rows.replaceChildren()
      for(const storage of [...storages].filter(item=>!filter.value||item.driver===filter.value).sort((a,b)=>a.order-b.order||a.mount_path.localeCompare(b.mount_path,"zh-CN"))){
        const row=node("article","","drive-admin-row"),text=node("div","","drive-admin-row-info"),actions=node("div","","drive-management-actions")
        text.append(node("strong",storage.mount_path),node("p",[storage.driver,storage.disabled?"已禁用":storage.status||"已启用",storage.remark].filter(Boolean).join(" · "),"drive-action-note"))
        const toggle=managementSwitch(`启用存储 ${storage.mount_path}`,!storage.disabled), enabled=toggle.input
        enabled.addEventListener("change",()=>{
          if(busy){enabled.checked=!storage.disabled;toggle.update();return}
          const next=enabled.checked;enabled.disabled=true
          void mutation(()=>api(`admin/storage/${next?"enable":"disable"}?id=${storage.id}`,{})).catch(error=>{enabled.checked=!next;toggle.update();fail(error)}).finally(()=>{enabled.disabled=false})
        },{signal})
        actions.append(toggle.wrapper,managementButton("编辑",()=>void openStorage(storage.id)),managementButton("删除",()=>confirm("删除存储",`确认移除 ${storage.mount_path} 的挂载配置？源文件会保留。`,()=>api(`admin/storage/delete?id=${storage.id}`,{})),true))
        row.append(text,actions);rows.append(row)
      }
      if(!rows.children.length)rows.append(node("p","暂无符合条件的存储","drive-action-note"))
    };filter.addEventListener("change",render,{signal});render()
  }
  const refresh=async()=>{const request=++serial;const result=await readManagementPages<AdminStorage>(api,"admin/storage/list");if(!signal.aborted&&request===serial){storages=result;listView()}}
  const openStorage=async(id:number)=>{const request=++serial;status.textContent="正在读取存储配置…";try{const record=await api<AdminStorage>(`admin/storage/get?id=${id}`);if(!drivers[record.driver])drivers[record.driver]=await api<DriverInfo>(`admin/driver/info?driver=${encodeURIComponent(record.driver)}`);if(!signal.aborted&&request===serial)edit(record)}catch(error){fail(error)}}
  const edit=(record:AdminStorage)=>{
    serial++;ui.clearError();status.textContent="";status.hidden=true;ui.submit.hidden=false;ui.submit.textContent=record.id?"保存修改":"新增"
    toolbar.replaceChildren();toolbar.hidden=true;setManagementBack(ui,listView);content.replaceChildren()
    const picker=createDriveDriverPicker(Object.keys(drivers).sort(),record.driver,Boolean(record.id),signal,name=>{
      let draft=record
      try{draft=collect?.()||record}catch{}
      edit({...draft,driver:name,addition:"{}"})
    })
    content.append(picker.element)
    const info=drivers[record.driver];if(!info){ui.submit.disabled=true;throw new Error("没有可用的存储驱动")}
    let addition:Record<string,unknown>;try{addition=parseStorageAddition(record.addition)}catch(error){ui.submit.hidden=true;fail(error);return}
    ui.submit.disabled=false
    const fields=node("div","","drive-admin-fields drive-storage-fields"),common=adminSection(fields,"基本设置"),specific=adminSection(fields,"驱动配置")
    const advanced=node("details","","drive-storage-advanced");advanced.append(node("summary","高级设置"))
    const commonGrid=node("div","","drive-schema-grid"),specificGrid=node("div","","drive-schema-grid"),advancedGrid=node("div","","drive-schema-grid")
    const commonOptions=node("div","","drive-storage-options"),specificOptions=node("div","","drive-storage-options"),advancedOptions=node("div","","drive-storage-options")
    common.append(commonGrid,commonOptions);specific.append(specificGrid,specificOptions);advanced.append(advancedGrid,advancedOptions);fields.append(advanced);content.append(fields)
    const basic=new Set(["mount_path","order","cache_expiration","remark"])
    const getters:{key:string;additional:boolean;value:()=>unknown}[]=[]
    const field=(item:DriverItem,additional:boolean)=>{
      const parent=additional?specificGrid:basic.has(item.name)?commonGrid:advancedGrid,title=labels[item.name]||item.name.replaceAll("_"," "),value=(additional?addition[item.name]:record[item.name])??driverDefault(item)
      if(item.type==="bool"){
        const check=managementCheck(title,value===true||value==="true");(additional?specificOptions:basic.has(item.name)?commonOptions:advancedOptions).append(check.wrapper);getters.push({key:item.name,additional,value:()=>check.input.checked});return
      }
      let input:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement
      if(item.type==="select"){
        const caption=node("label",title),control=node("select");control.setAttribute("aria-label",title)
        const values=(item.options||"").split(",");if(!values.includes(String(value)))values.unshift(String(value))
        for(const value of [...new Set(values)]){const option=node("option",optionLabels[value]||value||"默认");option.value=value;control.append(option)}control.value=String(value);caption.append(control);parent.append(caption);input=control
      }else if(item.type==="text"||item.type==="multipath"){
        const caption=node("label",title),control=node("textarea");control.rows=4;control.value=typeof value==="string"?value:JSON.stringify(value,null,2);control.setAttribute("aria-label",title);caption.append(control);caption.classList.add("drive-admin-wide");parent.append(caption);input=control
      }else{
        input=/password|passwd|secret|token|api_key|access_key/i.test(item.name)?adminPassword(parent,title,String(value)):adminField(parent,title,String(value),item.type==="number"||item.type==="float"?"number":"text")
        if(item.type==="number"||item.type==="float")input.step=item.type==="float"?"any":"1"
        if(!additional&&item.name==="mount_path")attachDriveDirectoryPicker(input,{signal,token,absolute:true,basePath})
      }
      input.required=Boolean(item.required)
      const caption=input.closest("label")
      if(item.required)caption?.classList.add("drive-storage-required")
      if(item.name==="mount_path"||item.name==="remark")(input.closest(".drive-directory-field")||caption)?.classList.add("drive-admin-wide")
      if(item.help)caption?.append(node("small",item.help,"drive-action-note"))
      getters.push({key:item.name,additional,value:()=>{
        if(item.type==="number"||item.type==="float"){const value=Number(input.value);if(!Number.isFinite(value))throw new Error(`${title} 必须为数字`);return value}
        if(item.type==="multipath"&&Array.isArray(value)){const parsed=JSON.parse(input.value);if(!Array.isArray(parsed))throw new Error(`${title} 必须为数组`);return parsed}
        return input.value
      }})
    }
    for(const item of info.common||[])field(item,false)
    if(!(info.common||[]).some(item=>item.name==="mount_path"))field({name:"mount_path",type:"string",required:true},false)
    for(const item of info.additional||[])field(item,true)
    if(!specificGrid.children.length&&!specificOptions.children.length)specific.hidden=true
    advanced.hidden=!advancedGrid.children.length&&!advancedOptions.children.length
    if(info.config?.need_ms){const link=node("a","打开驱动授权");link.href="https://drive.goblincwl.site/@manage/messenger";link.target="_blank";link.rel="noopener noreferrer";content.append(link)}
    collect=()=>{
      const draft:AdminStorage={...record,driver:record.driver},values={...addition}
      for(const getter of getters){if(getter.additional)values[getter.key]=getter.value();else draft[getter.key]=getter.value()}
      if(!draft.mount_path?.startsWith("/")||draft.mount_path.split("/").some(part=>part===".."||part==="."))throw new Error("请输入有效的挂载路径")
      draft.mount_path=draft.mount_path.replace(/\/$/,"")||"/";draft.addition=JSON.stringify(values);return draft
    }

  }
  ui.run(async()=>{if(!collect)throw new Error("请选择存储");const draft=collect();await api(`admin/storage/${draft.id?"update":"create"}`,draft);await changed();await refresh();showPasswordToast("存储已保存")}, { closeOnSuccess: false })
  try{const [list,schemas]=await Promise.all([readManagementPages<AdminStorage>(api,"admin/storage/list"),api<Record<string,DriverInfo>>("admin/driver/list")]);storages=list;drivers=schemas;listView()}
  catch(error){fail(error);status.textContent="";toolbar.replaceChildren(managementButton("重试",()=>{void setupReload()}))}
  async function setupReload(){try{drivers=await api<Record<string,DriverInfo>>("admin/driver/list");await refresh()}catch(error){fail(error)}}
}
