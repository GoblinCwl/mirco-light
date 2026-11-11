// Serialized into the isolated player. This adapts the pinned libpgs worker's
// readiness/error protocol; all SUP parsing and drawing stays in upstream libpgs.
export function createPgsSubtitleRenderer(library:any,options:Record<string,any>,onFailure?:(error:Error)=>void,timeout=60000) {
  const renderer=new library.PgsRenderer({...options,subUrl:undefined})
  const worker:Worker|undefined=renderer.implementation?.worker
  if(!worker){renderer.dispose();throw new Error('PGS 渲染器无法启动')}
  let settled=false,disposed=false,timer:ReturnType<typeof setTimeout>
  let resolveReady:()=>void=()=>{},rejectReady:(error:Error)=>void=()=>{}
  const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject})
  const clean=()=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',failed)}
  const failed=()=>{
    if(disposed)return
    clean()
    const error=new Error('PGS 字幕渲染失败')
    if(!settled){settled=true;rejectReady(error)}else onFailure?.(error)
  }
  const message=(event:MessageEvent)=>{
    if(event.data?.op==='quartzPgsError'){failed();return}
    if(!settled && event.data?.op==='updateTimestamps'){
      settled=true;clearTimeout(timer);resolveReady()
    }
  }
  worker.addEventListener('message',message);worker.addEventListener('error',failed)
  timer=setTimeout(failed,timeout)
  try{renderer.loadFromUrl(options.subUrl)}catch{failed()}
  return {renderer,ready,dispose:()=>{
    if(disposed)return
    disposed=true;clean();renderer.dispose()
    if(!settled){settled=true;rejectReady(new DOMException('字幕选择已更新','AbortError'))}
  }}
}
