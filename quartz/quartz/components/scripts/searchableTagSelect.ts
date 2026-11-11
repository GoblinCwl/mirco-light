import {createDriveDriverPicker} from './driveDriverPicker'
import {node} from './driveUi'
// Keep the existing select as the source of choices and change events.
export function searchableTagSelect(select:HTMLSelectElement,signal:AbortSignal){
 const dialogLifecycle=new AbortController();select.closest('dialog')?.addEventListener('close',()=>dialogLifecycle.abort(),{once:true});signal=AbortSignal.any([signal,dialogLifecycle.signal])
 select.hidden=true;const host=node('div','','searchable-tag-select');select.after(host)
 let pickerLifecycle:AbortController|undefined
 signal.addEventListener('abort',()=>pickerLifecycle?.abort(),{once:true})
 const render=()=>{pickerLifecycle?.abort();pickerLifecycle=new AbortController();const options=[...select.options].filter(option=>option.value&&!option.disabled);const picker=createDriveDriverPicker(options.map(option=>option.textContent||option.value),'选择已有标签',select.disabled,pickerLifecycle.signal,name=>{const option=options.find(option=>option.textContent===name);if(option){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}))}},'标签');picker.element.firstElementChild?.remove();host.replaceChildren(picker.element)}
 const observer=new MutationObserver(render);observer.observe(select,{childList:true,attributes:true,attributeFilter:['disabled'],subtree:true});signal.addEventListener('abort',()=>observer.disconnect(),{once:true});render()
}
