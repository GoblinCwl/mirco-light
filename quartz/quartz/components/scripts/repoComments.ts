export function resetRepoComments(){
 const root=document.getElementById('artalk-comments');if(!root)return
 document.dispatchEvent(new Event('repo-comments-reset'))
 const next=root.cloneNode(false) as HTMLElement;next.hidden=true;next.dataset.driveShareComments='pending';delete next.dataset.repoCommentsName;next.className='artalk-comments artalk-loading';next.style.removeProperty('display');root.replaceWith(next)
}
export async function setupRepoComments(name:string,signal:AbortSignal){
 let root=document.getElementById('artalk-comments');if(!root)return
 if(root.dataset.repoCommentsName===name&&root.dataset.driveShareComments==='ready')return
 resetRepoComments();root=document.getElementById('artalk-comments')!;root.dataset.repoCommentsName=name
 try{
  const response=await fetch('/api/site/repo-comments?'+new URLSearchParams({slug:'Repo/'+name}),{signal,credentials:'omit',cache:'no-store'}),value=await response.json()
  if(signal.aborted||!root.isConnected)return
  if(!response.ok)throw Error(value.error||'评论读取失败')
  root.dataset.pageKey=value.key;root.dataset.pageTitle=value.title;root.dataset.adminOnly=String(value.comment!==true)
  root.classList.toggle('artalk-admin-only-pending',value.comment!==true);root.dataset.driveShareComments='ready';root.hidden=false
  document.dispatchEvent(new Event('drive-share-comments-ready'))
 }catch(error){if(!signal.aborted&&root.isConnected){root.hidden=false;root.classList.remove('artalk-loading');const message=document.createElement('p'),retry=document.createElement('button');message.textContent=error instanceof Error?error.message:'评论读取失败';retry.type='button';retry.textContent='重试';retry.onclick=()=>void setupRepoComments(name,signal);root.replaceChildren(message,retry)}}
}
