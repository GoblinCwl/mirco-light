import { escapeHTML as e } from "../../util/escape"

export const CATALOG_PAGE_SIZE = 12
export function paginateCatalog<T>(items: readonly T[], requested: number, size = CATALOG_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size))
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1))
  const start = (page - 1) * size
  return {items:items.slice(start,start+size),page,pages,total:items.length}
}
export function catalogSortControl(attribute: string, label: string, options: readonly (readonly [string,string])[], selected: string) {
  return `<label class="catalog-sort"><span>排序</span><select ${attribute} aria-label="${e(label)}">${options.map(([value,text])=>`<option value="${e(value)}"${value===selected?' selected':''}>${e(text)}</option>`).join("")}</select></label>`
}
export function catalogPagination(page: number, pages: number, href: (page:number)=>string) {
  if (pages <= 1) return ""
  const choices = [...new Set([1,page-1,page,page+1,pages])].filter(value=>value>=1&&value<=pages).sort((a,b)=>a-b)
  const link = (value:number,text:string) => `<a href="${e(href(value))}" data-catalog-page-link data-no-popover="true"${value===page?' aria-current="page"':''}>${text}</a>`
  return `<nav class="catalog-pagination" aria-label="分页">${page>1?link(page-1,"上一页"):'<span aria-disabled="true">上一页</span>'}${choices.map((value,index)=>(index&&value>choices[index-1]+1?'<span class="catalog-page-gap" aria-hidden="true">…</span>':"")+link(value,String(value))).join("")}${page<pages?link(page+1,"下一页"):'<span aria-disabled="true">下一页</span>'}<small>第 ${page} / ${pages} 页</small></nav>`
}
