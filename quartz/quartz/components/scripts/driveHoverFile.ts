import {setupDrivePreview} from './drivePreview'
import type {PreviewFile} from './drivePreviewOptions'
import type {PreviewAccess} from './driveArchivePreview'
import {node} from './driveUi'

/** The same file-only viewport and loading state for Share and Repo hovers. */
export function driveHoverFile(file:PreviewFile,address:string,access:PreviewAccess,signal:AbortSignal,source?:{text:string}) {
  const wrapper=node('div','','drive-page drive-hover-file'),chooser=node('div'),select=node('select'),body=node('div')
  body.className='drive-preview-body drive-hover-preview-body'
  wrapper.setAttribute('data-drive-loading-root','')
  const loading=node('span','','drive-loading-overlay')
  loading.setAttribute('data-drive-page-loading','');loading.setAttribute('role','status');loading.setAttribute('aria-label','正在加载文件预览')
  loading.innerHTML='<span class="drive-loading-badge"><span class="drive-loading" aria-hidden="true"><svg class="drive-loading-progress" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" pathLength="100"/></svg><i></i></span></span>'
  chooser.hidden=true;chooser.append(select);wrapper.append(chooser,body,loading)
  const preview=setupDrivePreview(body,signal,{chooser,hover:true,source})
  void preview.load(file,address,access,signal).catch(()=>{})
  return wrapper
}
