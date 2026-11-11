import { normalizeDrivePath } from "./openlistShared"
import { adminPassword } from "./driveAdminFields"
import { node } from "./driveUi"
import { createDriveHtmlField } from "./driveHtmlField"
import { attachDriveDirectoryPicker } from "./driveDirectoryPicker"
import { showPasswordToast } from "./passwordFeedback"
import { emptyDriveMeta, type DriveMeta } from "./driveManagementModel"
import { setManagementBack, managementSession, managementButton, managementCheck, readManagementPages, confirmManagement, type ManagementDialog } from "./driveManagementUi"
type MetaUser = { id: number; username: string }
export async function setupDriveMetaManager(ui: ManagementDialog, parent: AbortSignal, token: string, basePath: string, changed: () => Promise<unknown>, initialPath?: string) {
  const { api, signal } = managementSession(ui, parent, token)
  let metas: DriveMeta[] = [], users: MetaUser[] = [], current: DriveMeta | undefined
  let collect: (() => DriveMeta) | undefined, serial = 0
  const toolbar = node("div", "", "drive-management-toolbar"), content = node("div", "", "drive-meta-content")
  const status = node("p", "正在读取元信息…", "drive-action-note"); status.setAttribute("role", "status")
  ui.body.append(toolbar, status, content); ui.submit.hidden = true; ui.cancel.textContent = "关闭"
  const listView = () => {
    serial++
    setManagementBack(ui); toolbar.hidden = false; status.hidden = false
    current = undefined; collect = undefined; ui.submit.hidden = true; ui.clearError(); status.textContent = `共 ${metas.length} 条元信息`
    toolbar.replaceChildren(managementButton("新增元信息", () => edit(emptyDriveMeta())), managementButton("刷新", () => { void refresh().catch(fail) }))
    content.replaceChildren()
    if (!metas.length) { content.append(node("p", "尚未配置元信息", "drive-action-note")); return }
    const list = node("div", "", "drive-meta-list")
    for (const meta of [...metas].sort((a,b)=>a.path.localeCompare(b.path,"zh-CN",{numeric:true}))) {
      const row = node("div", "", "drive-meta-row"), path = managementButton(meta.path, () => { void openMeta(meta.id) })
      path.classList.add("drive-meta-path")
      const flags = [meta.password ? "有访问密码" : "", meta.write ? "允许写入" : "", meta.header || meta.readme ? "有页面说明" : ""].filter(Boolean)
      const actions = node("div", "", "drive-management-actions")
      actions.append(managementButton("编辑", () => { void openMeta(meta.id) }), managementButton("删除", () => {
        confirmManagement("删除元信息", `确认删除 ${meta.path} 的元信息？目录和文件会保留。`, signal, async () => {
          await api(`admin/meta/delete?id=${meta.id}`, {}); await refresh(); await changed(); showPasswordToast("元信息已删除")
        })
      }, true))
      row.append(path, node("span", flags.join(" · "), "drive-action-note"), actions); list.append(row)
    }
    content.append(list)
  }
  const fail = (error: unknown) => { if (!signal.aborted) ui.fail(error instanceof Error ? error.message : "读取失败")}
  const refresh = async () => {
    const request = ++serial; status.textContent = "正在读取元信息…"
    const result = await readManagementPages<DriveMeta>(api, "admin/meta/list")
    if (signal.aborted || request !== serial) return
    metas = result; listView()
  }
  const openMeta = async (id: number) => {
    const request = ++serial; status.textContent = "正在读取元信息…"; ui.submit.hidden = true
    try { const meta = await api<DriveMeta>(`admin/meta/get?id=${id}`); if (!signal.aborted && request === serial) edit(meta) }
    catch (error) { fail(error) }
  }
  const edit = (meta: DriveMeta) => {
    serial++; current = { ...emptyDriveMeta(), ...meta }; ui.clearError(); status.textContent = ""; status.hidden = true
    ui.submit.hidden = false; ui.submit.textContent = meta.id ? "保存修改" : "新增"; content.replaceChildren()
    toolbar.replaceChildren(); toolbar.hidden = true; setManagementBack(ui, listView)
    const fields = node("div", "", "drive-meta-fields"), location = node("section", "", "drive-meta-location"), pathLabel = node("label", "目录路径"), path = node("input")
    path.value = meta.path; path.placeholder = "/Vault/目录"; path.required = true; path.autocomplete = "off"; pathLabel.append(path); location.append(pathLabel); fields.append(location)
    attachDriveDirectoryPicker(path, { signal, token, absolute: true, basePath })
    const controls = new Map<keyof DriveMeta, HTMLInputElement | HTMLTextAreaElement>()
    const section = (title: string, sub: keyof DriveMeta, help?: string) => {
      const group = node("section", "", "drive-meta-field"), heading = node("div", "", "drive-meta-field-heading")
      const apply = managementCheck("应用到子目录", Boolean(meta[sub])); controls.set(sub, apply.input)
      heading.append(node("strong", title), apply.wrapper); group.append(heading)
      if (help) group.append(node("p", help, "drive-action-note"))
      group.setAttribute("aria-label",title); fields.append(group); return group
    }
    const passwordGroup = section("访问密码", "p_sub")
    const password = adminPassword(passwordGroup, "访问密码", meta.password || "", true); controls.set("password", password)
    const writeGroup = section("允许写入", "w_sub", "允许可访问此目录的用户上传、新建文件和文件夹。")
    const write = managementCheck("允许写入", Boolean(meta.write)); controls.set("write", write.input); writeGroup.append(write.wrapper)
    const userChecks = new Map<"read_users" | "write_users", Map<number, HTMLInputElement>>()
    for (const [key, sub, label] of [["read_users", "read_users_sub", "允许读取的用户"], ["write_users", "write_users_sub", "允许写入的用户"]] as const) {
      const group = section(label, sub, "不选择用户时，沿用用户本身的权限。"), choices = node("div", "", "drive-meta-users"), inputs = new Map<number, HTMLInputElement>()
      const options = [...users]
      for (const id of meta[key] || []) if (!options.some(user => user.id === id)) options.push({ id, username: `用户 #${id}` })
      for (const user of options) { const item = managementCheck(user.username, meta[key]?.includes(user.id)); inputs.set(user.id, item.input); choices.append(item.wrapper) }
      userChecks.set(key, inputs); group.append(choices)
    }
    for (const [key, sub, title] of [["hide", "h_sub", "隐藏规则"], ["header", "header_sub", "顶部说明"], ["readme", "r_sub", "底部说明"]] as const) {
      const group = section(title, sub, key === "hide" ? "每行一条正则表达式。" : undefined)
      if (key === "hide") {
        group.classList.add("drive-meta-rules")
        const input = node("textarea"); input.value = meta.hide || ""; input.rows = 3; input.setAttribute("aria-label", title); controls.set(key,input); group.append(input)
      } else {
        const input = createDriveHtmlField(group, { label: title, value: meta[key], signal, heading: group.querySelector<HTMLElement>(".drive-meta-field-heading")! })
        controls.set(key,input)
      }
    }
    content.append(fields)
    collect = () => {
      const value = path.value.trim()
      if (!value.startsWith("/") || value.split("/").some(part => part === ".." || part === ".") || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("请输入有效的绝对目录路径")
      const normalized = value.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/"
      if (metas.some(item => item.path === normalized && item.id !== current!.id)) throw new Error("该目录已有元信息，请返回列表选择后编辑")
      const draft = { ...current!, path: normalized }
      for (const [key, input] of controls) Object.assign(draft, { [key]: input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value })
      for (const [key, inputs] of userChecks) draft[key] = [...inputs].filter(([,input])=>input.checked).map(([id])=>id)
      return draft
    }
  }
  ui.run(async () => {
    if (!collect) throw new Error("请选择要编辑的元信息")
    const draft = collect(); await api(`admin/meta/${draft.id ? "update" : "create"}`, draft)
    await changed(); await refresh(); showPasswordToast("元信息已保存")
  }, { closeOnSuccess: false })
  const initialize = async () => {
    ui.clearError(); status.textContent = "正在读取元信息…"
    try {
      const [userList, metaList] = await Promise.all([readManagementPages<MetaUser>(api, "admin/user/list"), readManagementPages<DriveMeta>(api, "admin/meta/list")])
      if (signal.aborted) return
      users = userList.map(({ id, username }) => ({ id, username })); metas = metaList
      if (initialPath) {
        const path = normalizeDrivePath(initialPath), existing = metas.find(meta => normalizeDrivePath(meta.path) === path)
        if (existing) await openMeta(existing.id)
        else edit({ ...emptyDriveMeta(), path })
      } else listView()
    } catch (error) { if (!signal.aborted) { fail(error); status.textContent = ""; toolbar.replaceChildren(managementButton("重试", () => { void initialize() })) } }
  }
  await initialize()
}
