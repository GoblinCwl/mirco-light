import {showPasswordToast} from './passwordFeedback'
import { drivePassword, driveRequest, driveToken } from "./driveClient"
import { joinDrivePath, normalizeDrivePath } from "./openlistShared"
import { fileIconForName, node } from "./driveUi"

// Shared by move/copy/extract/offline-download and absolute metadata paths.
export function attachDriveDirectoryPicker(input: HTMLInputElement, options: { signal: AbortSignal; token: string; absolute?: boolean; basePath?: string; includeFiles?: boolean }) {
  const label = input.closest("label")!, dialog = input.closest("dialog")
  const wrapper = node("div", "", "drive-directory-field"), row = node("div", "", "drive-directory-input"), browse = node("button", "选择目录")
  browse.type = "button"; browse.setAttribute("aria-expanded", "false")
  if (options.includeFiles) browse.textContent = "选择路径"
  label.replaceWith(wrapper); row.append(label,browse); wrapper.append(row)
  const picker = node("div", "", "drive-directory-picker"), toolbar = node("div", "", "drive-directory-toolbar")
  const home = node("button", "根目录"), up = node("button", "上级目录"), current = node("span", "", "drive-directory-current"), use = node("button", "使用此目录")
  home.type = up.type = use.type = "button"; toolbar.append(home,up,current); picker.append(toolbar)
  const folders = node("div", "", "drive-directory-folders"), status = node("p", "", "drive-action-note"), footer = node("div", "", "drive-directory-footer")
  footer.append(status,use); picker.append(folders,footer); picker.hidden = true; wrapper.append(picker)
  const controller = new AbortController(), signal = AbortSignal.any([options.signal,controller.signal])
  dialog?.addEventListener("close",()=>controller.abort(),{once:true})
  const base = normalizeDrivePath(options.basePath || "/"), root = options.absolute ? base : "/"
  let cursor = root, serial = 0
  const select = (path: string) => {
    input.value = path; input.dispatchEvent(new Event("input",{bubbles:true})); input.dispatchEvent(new Event("change",{bubbles:true}))
    picker.hidden = true; browse.setAttribute("aria-expanded","false"); input.focus()
  }
  const read = async (value: string) => {
    const id = ++serial; folders.replaceChildren(); status.textContent = "正在读取目录…"; use.disabled = true; up.disabled = true
    try {
      if (options.token !== driveToken()) throw new Error("登录状态已变化，请重新打开表单")
      const path = normalizeDrivePath(value)
      if (options.absolute && base !== "/" && path !== base && !path.startsWith(`${base}/`)) throw new Error(`当前账号可浏览的起点为 ${base}`)
      const relative = options.absolute && base !== "/" ? path.slice(base.length) || "/" : path
      const request = { path: relative, password: drivePassword("storage","",relative), page: 1, per_page: 0 }
      const data = options.includeFiles
        ? (await driveRequest<{ content: { name: string; is_dir: boolean }[] | null }>("fs/list", request, { token: options.token, signal })).content || []
        : (await driveRequest<{ name: string }[]>("fs/dirs", request, { token: options.token, signal })).map(item => ({ ...item, is_dir: true }))
      if (signal.aborted || id !== serial || options.token !== driveToken()) return
      cursor = path; current.textContent = cursor; up.disabled = cursor === root; use.disabled = false
      for (const directory of [...data].sort((a,b)=>Number(b.is_dir)-Number(a.is_dir)||a.name.localeCompare(b.name,"zh-CN",{numeric:true}))) {
        const button = node("button", "", "drive-directory-entry"); button.type = "button"
        button.append(fileIconForName(directory.name,directory.is_dir),node("span",directory.name))
        button.addEventListener("click",()=>{ const path = joinDrivePath(cursor,directory.name); if (directory.is_dir) void read(path); else select(path) },{signal}); folders.append(button)
      }
      status.textContent = data.length ? `${data.length} 个${options.includeFiles ? "项目" : "文件夹"}` : options.includeFiles ? "此目录为空" : "此目录没有子文件夹"
    } catch (error) { if (!signal.aborted && id === serial) {status.textContent="";showPasswordToast(error instanceof Error ? error.message : "读取目录失败",true)} }
  }
  browse.addEventListener("click", event=>{
    event.preventDefault(); picker.hidden = !picker.hidden; browse.setAttribute("aria-expanded",String(!picker.hidden))
    if (!picker.hidden) {
      const value = input.value.trim() || root
      const start = options.includeFiles ? value.slice(0,value.lastIndexOf("/")) || root : value
      void read(options.absolute && base !== "/" && start !== base && !start.startsWith(`${base}/`) ? root : start)
    }
  },{signal})
  home.addEventListener("click",()=>void read(root),{signal})
  up.addEventListener("click",()=>void read(cursor.slice(0,cursor.lastIndexOf("/")) || root),{signal})
  use.addEventListener("click",()=>{
    select(cursor)
  },{signal})
  return { element: wrapper, dispose: ()=>controller.abort() }
}
