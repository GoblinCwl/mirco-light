import { node } from "./driveUi"
export function adminField(parent: HTMLElement, label: string, value = "", type = "text") {
  const wrapper = node("label",label), input = node("input")
  input.type = type; input.value = value; input.setAttribute("aria-label",label); wrapper.append(input); parent.append(wrapper)
  return input
}
export function adminPassword(parent: HTMLElement, label: string, value = "", hideCaption = false) {
  const input = adminField(parent,label,value), caption = input.closest("label")!, wrapper = node("div","","drive-password-field"), button = node("button")
  if (hideCaption) caption.firstChild?.remove()
  input.className = "drive-masked-password"; input.autocomplete = "off"; input.autocapitalize = "none"; input.spellcheck = false
  for (const name of ["data-1p-ignore","data-lpignore","data-bwignore"]) input.setAttribute(name,"true")
  button.type = "button"; button.className = "drive-password-toggle"
  input.replaceWith(wrapper); wrapper.append(input,button)
  const update = () => {
    const plain = input.classList.contains("is-plain"), title = plain ? "隐藏密码" : "显示密码"
    button.setAttribute("aria-label",title);button.title=title;button.setAttribute("aria-pressed",String(plain))
    button.innerHTML=`<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">${plain ? '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.6 6.6A19 19 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.6"/>' : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'}</svg>`
  };button.addEventListener("click",()=>{input.classList.toggle("is-plain");update()});update()
  return input
}
export function adminSection(parent: HTMLElement, title: string) {
  const section=node("section","","drive-admin-section");section.append(node("h3",title));parent.append(section);return section
}
