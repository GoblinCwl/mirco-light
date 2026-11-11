import {node} from './driveUi'

export function showAdminListLoading(root:HTMLElement){
 const state=node('div','','stellar-list-message'),spinner=node('span','','drive-loading');spinner.setAttribute('aria-hidden','true');spinner.append(node('i'));state.setAttribute('role','status');state.append(spinner,node('span','正在读取记录…'));root.replaceChildren(state);root.setAttribute('aria-busy','true')
}
export function showAdminListMessage(root:HTMLElement,title:string,description:string,retry?:()=>void){
 const state=node('div','','stellar-list-message'),icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.4');icon.setAttribute('stroke-linecap','round');icon.setAttribute('stroke-linejoin','round');icon.setAttribute('aria-hidden','true')
 const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',retry?'M12 8v4m0 4h.01M4 4l16 16M6 3h12v4M3 7v14h18V10':'M4 5h16v15H4ZM8 3h8M8 10h8m-8 4h5');icon.append(path);state.append(icon,node('strong',title),node('p',description));state.setAttribute('role',retry?'alert':'status')
 if(retry){const button=node('button','重新加载');button.type='button';button.onclick=retry;state.append(button)}
 root.replaceChildren(state);root.removeAttribute('aria-busy')
}
