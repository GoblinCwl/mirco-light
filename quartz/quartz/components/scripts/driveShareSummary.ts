import {drivePassword,driveRequest,DriveError} from './driveClient'
import {RequestCache,sharedState} from './sharedRequest'
import type {DriveFile} from './openlistShared'
type ShareRoot={content:DriveFile[];total:number;directories:number;files:number;isFile:boolean}
const state=sharedState('drive-share-root:v1',()=>({requests:new RequestCache<ShareRoot>(60000,24),listening:false}))
if(!state.listening){
  state.listening=true
  for(const event of ['drive-files-changed','drive-directory-unlocked','drive-auth-change'])document.addEventListener(event,()=>state.requests.clear())
}
export function readDriveShareRoot(share:string,signal:AbortSignal) {
  const password=drivePassword('share',share,'/')
  return state.requests.read(JSON.stringify([share,password]),async requestSignal=>{
    const path=`/@s/${share}`,options={anonymous:true,signal:requestSignal,timeout:10000}
    let content:DriveFile[],total:number,isFile=false
    try {
      const result=await driveRequest<{content:DriveFile[]|null;total:number}>('fs/list',{path,password,page:1,per_page:0,refresh:false},options)
      content=result.content||[];total=result.total??content.length
      if(total>content.length)throw new Error('分享列表不完整，无法准确统计')
    }catch(error){
      if(error instanceof DriveError&&[401,403].includes(error.code))throw error
      const file=await driveRequest<DriveFile>('fs/get',{path,password},options)
      if(file.is_dir)throw error
      content=[file];total=1;isFile=true
    }
    // Count this one returned level only. No child paths or recursive requests.
    let directories=0,files=0
    for(const file of content)if(file.is_dir)directories++;else files++
    return {content,total,directories,files,isFile}
  },{signal})
}
