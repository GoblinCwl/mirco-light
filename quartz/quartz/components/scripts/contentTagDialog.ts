import {driveActionDialog} from './driveActionDialog'
import {node} from './driveUi'
import {searchableTagSelect} from './searchableTagSelect'
import {peekContentCatalog,readContentCatalog} from './contentCatalog'
import {showPasswordToast} from './passwordFeedback'
export function openContentTagDialog(title:string,tags:string[],sourceTags:string[],signal:AbortSignal,save:(tags:string[])=>Promise<void>){
 void readContentCatalog().catch(()=>{})
   const ui=driveActionDialog('编辑标签',signal),selected=new Set(tags),section=node('section','','drive-share-settings'),chips=node('div','','drive-share-tag-chips'),row=node('div','','drive-share-tag-add'),input=node('input'),add=node('button','添加'),choose=node('select'),label=node('label','已有标签')
   ui.submit.textContent='保存';input.placeholder='输入标签';input.maxLength=100;input.setAttribute('aria-label','新标签');add.type='button';choose.setAttribute('aria-label','选择已有标签')
   const choices=[...new Set(Object.values(peekContentCatalog()?.pages||{}).flatMap(item=>item.tags))].sort((a,b)=>a.localeCompare(b,'zh-CN'))
   const render=()=>{chips.replaceChildren(...[...selected].map(tag=>{const button=node('button',tag+' ×');button.type='button';button.setAttribute('aria-label','移除标签 '+tag);button.onclick=()=>{selected.delete(tag);render()};return button}));choose.replaceChildren(new Option('选择已有标签',''),...choices.filter(tag=>!selected.has(tag)).map(tag=>new Option(tag,tag)))}
   const insert=()=>{const tag=input.value.trim();if(!tag)return;if(selected.size>=50){showPasswordToast('最多添加 50 个标签',true);return}selected.add(tag);input.value='';render()}
   add.onclick=insert;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();insert()}};choose.onchange=()=>{if(choose.value){selected.add(choose.value);render()}}
   row.append(input,add);label.append(choose);section.append(chips,label,row);ui.body.append(node('p',title,'drive-action-note'),section);render();searchableTagSelect(choose,signal)
   const reset=node('button','恢复默认');reset.type='button';reset.onclick=()=>{selected.clear();for(const tag of sourceTags)selected.add(tag);input.value='';render()};ui.cancel.before(reset)

 ui.run(async()=>{await save([...selected,...(input.value.trim()?[input.value.trim()]:[])])})
 return ui.dialog
}
