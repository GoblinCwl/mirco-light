import {readContentCatalog} from './contentCatalog'
import {searchableTagSelect} from './searchableTagSelect'
import {showPasswordToast} from './passwordFeedback'
import { parseShareMetadata } from "../../util/shareMetadata.mjs"
import { node } from "./driveUi"

export function setupDriveShareSettings(body: HTMLElement, remark: string | undefined, signal: AbortSignal) {
  const initial = parseShareMetadata(remark), selected = new Set(initial.tags)
  const section = node("section", "", "drive-share-settings")
  const orderLabel = node("label", "排序"), order = node("input")
  order.type = "number"; order.step = "1"; order.value = String(initial.order ?? 100)
  order.setAttribute("aria-label", "分享排序"); order.required = true
  orderLabel.append(order, node("small", "数值越小越靠前，默认 100", "drive-action-note"))
  const toggle = node("label", "", "drive-share-comment"), comment = node("input")
  comment.type = "checkbox"; comment.checked = initial.comment; comment.setAttribute("role", "switch"); comment.setAttribute("aria-label", "允许普通用户评论")
  const explanation = node("span"); explanation.append(node("span", "允许普通用户评论"), node("small", "关闭时仅管理员可评论"))
  toggle.append(explanation, comment)
  const mediaToggle = node("label", "", "drive-share-comment"), jellyfin = node("input")
  jellyfin.type = "checkbox"; jellyfin.checked = initial.jellyfin === true; jellyfin.setAttribute("role", "switch"); jellyfin.setAttribute("aria-label", "Jellyfin 解析")
  const mediaExplanation = node("span"); mediaExplanation.append(node("span", "Jellyfin 解析"), node("small", "使用媒体标题和海报展示，并隐藏字幕等辅助文件"))
  mediaToggle.append(mediaExplanation, jellyfin)
  const label = node("label", "标签"), existing = node("select")
  existing.setAttribute("aria-label", "选择已有标签"); existing.disabled = true
  const placeholder = node("option", "选择已有标签"); placeholder.value = ""; existing.append(placeholder)
  label.append(existing)
  const chips = node("div", "", "drive-share-tag-chips"); chips.setAttribute("aria-label", "已选择标签")
  const row = node("div", "", "drive-share-tag-add"), input = node("input"), add = node("button", "添加标签")
  input.placeholder = "输入新标签"; input.setAttribute("aria-label", "新标签"); input.autocomplete = "off"; add.type = "button"
  row.append(input, add)
  const choices = new Set(initial.tags)
  const render = () => {
    chips.replaceChildren(...[...selected].map(tag => {
      const button = node("button", `${tag} ×`); button.type = "button"; button.setAttribute("aria-label", `移除标签 ${tag}`)
      button.addEventListener("click", () => { selected.delete(tag); render() }, { signal }); return button
    }))
    const options = [...choices].filter(tag => !selected.has(tag)).sort((a,b) => a.localeCompare(b,"zh-CN",{numeric:true}))
    existing.replaceChildren(placeholder, ...options.map(tag => { const option = node("option",tag); option.value = tag; return option }))
    existing.value = ""
  }
  const insert = (value: string) => {
    try {
      const tags = parseShareMetadata({ tags: [...selected, value], comment: comment.checked }, true).tags
      for (const tag of tags) { selected.add(tag); choices.add(tag) }
      render(); return true
    } catch (reason) { showPasswordToast(reason instanceof Error ? reason.message : "标签无效",true); return false }
  }
  add.addEventListener("click", () => { if (input.value.trim() && insert(input.value.trim())) input.value = "" }, { signal })
  input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); add.click() } }, { signal })
  existing.addEventListener("change", () => { if (existing.value) insert(existing.value) }, { signal })
  section.append(orderLabel, toggle, mediaToggle, label, chips, row); body.append(section); render(); searchableTagSelect(existing,signal)
  void readContentCatalog().then(({pages})=>{
    if(signal.aborted||!section.isConnected)return
    for(const page of Object.values(pages))for(const tag of page.tags||[])choices.add(tag)
    render();existing.disabled=false
  }).catch(()=>{if(!signal.aborted&&section.isConnected){render();existing.disabled=false}})
  return () => parseShareMetadata({ ...(initial.sharedAt?{sharedAt:initial.sharedAt}:{}), tags: [...selected, ...(input.value.trim() ? [input.value.trim()] : [])], comment: comment.checked, jellyfin: jellyfin.checked, order: Number(order.value) }, true)
}
