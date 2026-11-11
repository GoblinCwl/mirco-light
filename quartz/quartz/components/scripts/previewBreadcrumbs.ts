/** Use the same breadcrumb DOM as article previews. All labels are text nodes. */
export function previewBreadcrumbs(parts:{label:string;href:string}[]){
 const nav=document.createElement('nav');nav.className='breadcrumb-container';nav.setAttribute('aria-label','breadcrumbs')
 for(const [index,part] of parts.entries()){
  const item=document.createElement('div'),link=document.createElement('a');item.className='breadcrumb-element'
  link.textContent=part.label;link.href=part.href;link.dataset.noPopover='true';item.append(link)
  if(index<parts.length-1){const separator=document.createElement('p');separator.textContent=' ❯ ';item.append(separator)}
  nav.append(item)
 }
 return nav
}
