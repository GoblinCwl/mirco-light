import {fileTypeIcons,fileIconKind,type FileIconKind} from '../../util/fileTypeIcons'
export const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = "") => {
  const result = document.createElement(tag)
  result.textContent = text
  result.className = className
  return result
}
export const fileIcon = (kind: string) => {
  const icon = node("span", "", `drive-file-icon is-${kind}`)
  icon.setAttribute("aria-hidden", "true")
  icon.innerHTML = fileTypeIcons[(kind==='media'?'video':kind==='pdf'?'document':kind) as FileIconKind] || fileTypeIcons.other
  return icon
}


export const fileIconForName=(name:string,directory=false)=>fileIcon(fileIconKind(name,directory))
