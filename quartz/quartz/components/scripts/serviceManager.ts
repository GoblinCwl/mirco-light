import {showAdminListMessage} from './adminListState'
import { node } from "./driveUi"
import { driveActionDialog } from "./driveActionDialog"
import { adminPassword } from "./driveAdminFields"
import { showPasswordToast } from "./passwordFeedback"
import { serviceIcon } from "../../util/serviceIcons"
import { navigationIcon } from "./navigationIcon"
type Service = {
  id: string
  name: string
  integration: string
  icon: string
  container: string
  url: string
  strict: boolean
  credentialId: string
  enabled: boolean
  order: number
}
type Credential = {
  id: string
  name: string
  type: string
  username: string
  header: string
  configured: boolean
}
type Integration = { id: string; name: string; container: string; strict: boolean; url: string }
type Data = { services: Service[]; credentials: Credential[]; integrations: Integration[] }
export function setupServiceManager(
  root: HTMLElement,
  signal: AbortSignal,
  request: (path: string, init?: RequestInit) => Promise<any>,
) {
  let data: Data = { services: [], credentials: [], integrations: [] },
    revision = 0,
    busy = false
  const heading = node("div", "", "service-manager-heading"),
    add = node("button", "添加服务"),
    refresh = node("button", "刷新"),
    list = node("div", "", "service-manager-list")
  add.type = refresh.type = "button"
  heading.append(node("h3", "服务列表"), add, refresh)
  root.append(
    heading,
    node("p", "内部服务使用原接入配置；其他服务填写检测地址。", "service-manager-note"),
    list,
  )
  const notify = () => document.dispatchEvent(new Event("services-config-changed"))
  async function load() {
    const current = ++revision
    try {
      const value: Data = await request("/admin/services")
      if (signal.aborted || current !== revision) return
      data = value
      render()
    } catch (error) {
      if (!signal.aborted)
        showPasswordToast(error instanceof Error ? error.message : "读取服务失败", true)
    }
  }
  async function save(path: string, value?: unknown, method = "PUT") {
    if (busy) throw Error("请等待当前操作完成")
    busy = true
    try {
      await request(path, {
        method,
        ...(value !== undefined ? { body: JSON.stringify(value) } : {}),
      })
      if (signal.aborted) return
      notify()
      await load()
      showPasswordToast("已保存")
    } finally {
      busy = false
    }
  }
  const select = (
    ui: ReturnType<typeof driveActionDialog>,
    label: string,
    items: [string, string][],
    value: string,
  ) => {
    const wrapper = node("label", label),
      input = node("select")
    for (const [key, text] of items) input.append(new Option(text, key))
    input.value = value
    wrapper.append(input)
    ui.body.append(wrapper)
    return input
  }
  const toggle = (ui: ReturnType<typeof driveActionDialog>, label: string, value: boolean) => {
    const wrapper = node("label", "", "service-edit-switch"),
      input = node("input")
    input.type = "checkbox"
    input.setAttribute("role", "switch")
    input.checked = value
    wrapper.append(input, node("span", label))
    ui.body.append(wrapper)
    return input
  }
  const edit = (value?: Service) => {
    const ui = driveActionDialog(value ? "编辑服务" : "添加服务", signal)
    const source = select(
      ui,
      "服务来源",
      [
        ["", "其他服务"],
        ...data.integrations.map((item) => [item.id, item.name] as [string, string]),
      ],
      value?.integration || "",
    )
    const name = ui.field("显示名称", value?.name || ""),
      container = ui.field("Beszel 容器名称", value?.container || ""),
      url = ui.field("HTTP 检测地址", value?.url || "", "url")
    const iconField=node('label','','service-icon-field'),iconHeading=node('span','图标 SVG 代码'),iconPreview=node('span','','service-manager-icon'),iconCode=node('textarea','','svg-icon-code')
    iconHeading.append(iconPreview);iconField.append(iconHeading,iconCode);ui.body.append(iconField)
    iconCode.rows=5;iconCode.maxLength=16384;iconCode.spellcheck=false;iconCode.setAttribute('aria-label','图标 SVG 代码')
    iconCode.value=value?.icon || serviceIcon(source.value)
    let iconEdited=!!value?.icon
    const previewIcon=()=>{iconPreview.innerHTML=navigationIcon(iconCode.value || serviceIcon(source.value))}
    iconCode.oninput=()=>{iconEdited=true;previewIcon()};previewIcon()
    const existing = data.credentials.find((item) => item.id === value?.credentialId)
    const auth = select(
      ui,
      "检测认证",
      [
        ["", "无需认证"],
        ["basic", "Basic 账号密码"],
        ["bearer", "Bearer Token"],
        ["header", "自定义请求头"],
      ],
      existing?.type || "",
    )
    const authFields = node("div", "", "service-auth-fields")
    ui.body.append(authFields)
    const drafts = new Map<string, { username: string; header: string; secret: string }>()
    let username: HTMLInputElement | undefined,
      header: HTMLInputElement | undefined,
      secret: HTMLInputElement | undefined,
      lastType = auth.value
    const drawAuth = () => {
      if (secret)
        drafts.set(lastType, {
          username: username?.value || "",
          header: header?.value || "",
          secret: secret.value,
        })
      lastType = auth.value
      username = header = secret = undefined
      authFields.replaceChildren()
      if (!auth.value) return
      const draft = drafts.get(auth.value)
      const field = (label: string, text: string) => {
        const wrapper = node("label", label),
          input = node("input")
        input.value = text
        wrapper.append(input)
        authFields.append(wrapper)
        return input
      }
      if (auth.value === "basic") {
        username = field("账号", draft?.username ?? existing?.username ?? "")
        username.required = true
        username.maxLength = 500
      }
      if (auth.value === "header") {
        header = field("请求头名称", draft?.header ?? existing?.header ?? "")
        header.required = true
        header.maxLength = 100
      }
      const host = node("div", "", "service-auth-secret")
      authFields.append(host)
      secret = adminPassword(
        host,
        auth.value === "basic" ? "密码" : auth.value === "bearer" ? "Token" : "请求头值",
        draft?.secret || "",
        false,
      )
      secret.maxLength = 16384
      secret.required = !existing || existing.type !== auth.value
      secret.placeholder = existing && existing.type === auth.value ? "留空保留原值" : "请输入"
    }
    auth.onchange = drawAuth
    drawAuth()
    const order = ui.field(
        "排序",
        String(value?.order ?? (data.services.at(-1)?.order || 0) + 10),
        "number",
      ),
      enabled = toggle(ui, "启用此服务", value?.enabled ?? true),
      strict = toggle(ui, "HTTP 仅 2xx 判定正常", value?.strict ?? true)
    name.required = true
    name.maxLength = 100
    container.maxLength = 128
    url.maxLength = 2000
    order.min = "0"
    order.max = "100000"
    order.step = "1"
    ui.note("填写容器名称时优先使用 Beszel；留空时只检测 HTTP。认证仅用于此条目的状态检测。")
    let customURL = value?.integration ? "" : value?.url || ""
    const updateSource = (changed = false) => {
      const integration = data.integrations.find((item) => item.id === source.value)
      if (integration) {
        if (changed) {
          name.value = integration.name
          container.value = integration.container
          strict.checked = integration.strict
        }
        url.value = integration.url
      } else url.value = customURL
      url.disabled = !!integration
      url.required = !integration
      if(changed&&!iconEdited)iconCode.value=serviceIcon(source.value)
      previewIcon()
    }
    url.oninput = () => {
      customURL = url.value
    }
    source.onchange = () => updateSource(true)
    updateSource()
    ui.run(() => {
      const icon=iconCode.value.trim()
      if(icon&&!navigationIcon(icon))throw Error('请填写完整的 SVG 代码，不支持脚本、style 或外部资源')
      return save(
        "/admin/services" + (value ? "/" + encodeURIComponent(value.id) : ""),
        {
          name: name.value,
          integration: source.value,
          icon,
          container: container.value,
          url: source.value ? "" : url.value,
          authentication: {
            type: auth.value,
            username: username?.value || "",
            header: header?.value || "",
            secret: secret?.value || "",
          },
          enabled: enabled.checked,
          strict: strict.checked,
          order: Number(order.value),
        },
        value ? "PUT" : "POST",
      )
    })
  }
  const remove = (service: Service) => {
    const ui = driveActionDialog("删除服务", signal)
    ui.note(`确认删除「${service.name}」？`)
    ui.submit.textContent = "删除"
    ui.run(() => save("/admin/services/" + encodeURIComponent(service.id), undefined, "DELETE"))
  }
  function render() {
    list.replaceChildren()
    for (const service of data.services) {
      const row = node("div", "", "service-manager-row"),
        icon = node("span", "", "service-manager-icon"),
        copy = node("div", "", "service-manager-copy"),
        actions = node("div", "", "service-manager-actions"),
        enabled = node("input"),
        editButton = node("button", "编辑"),
        removeButton = node("button", "删除")
      icon.innerHTML = navigationIcon(service.icon || serviceIcon(service.integration))
      enabled.type = "checkbox"
      enabled.setAttribute("role", "switch")
      enabled.setAttribute("aria-label", `启用 ${service.name}`)
      enabled.checked = service.enabled
      enabled.onchange = async () => {
        enabled.disabled = true
        try {
          await save("/admin/services/" + encodeURIComponent(service.id), {
            ...service,
            enabled: enabled.checked,
          })
        } catch (error) {
          enabled.checked = service.enabled
          showPasswordToast(error instanceof Error ? error.message : "保存失败", true)
        } finally {
          enabled.disabled = false
        }
      }
      const authentication = data.credentials.find((item) => item.id === service.credentialId)
      copy.append(
        node("strong", service.name),
        node(
          "small",
          (service.integration
            ? data.integrations.find((item) => item.id === service.integration)?.name ||
              service.integration
            : "其他服务") +
            (service.container ? " · Beszel / HTTP" : " · HTTP") +
            (authentication
              ? " · " +
                ({ basic: "Basic", bearer: "Bearer", header: "自定义请求头" }[
                  authentication.type
                ] || "已认证")
              : "") +
            ` · 排序 ${service.order}`,
        ),
      )
      editButton.type = removeButton.type = "button"
      editButton.onclick = () => edit(service)
      removeButton.onclick = () => remove(service)
      actions.append(enabled, editButton, removeButton)
      row.append(icon, copy, actions)
      list.append(row)
    }
    if (!data.services.length)
      showAdminListMessage(list,"暂无服务","添加服务后会显示在这里。")
  }
  add.onclick = () => edit()
  refresh.onclick = () => void load()
  list.append(node("p", "正在读取服务列表…", "service-manager-note"))
  void load()
}
