import {driveRequest,DriveError} from './driveClient'
import {RequestCache,sharedState} from './sharedRequest'
import type {DriveFile} from './openlistShared'
type GuestListing={content:DriveFile[]|null;total:number;write?:boolean;header?:string;readme?:string}
const state=sharedState('share-guest-files:v1',()=>({reads:new RequestCache<GuestListing>(30000,32),listening:false}))
if(!state.listening){state.listening=true;document.addEventListener('drive-files-changed',()=>state.reads.clear())}
export function readGuestFiles(path:string,refresh=false){
 return state.reads.read(path,signal=>driveRequest<GuestListing>('fs/list',{path,password:'',page:1,per_page:0,refresh},{anonymous:true,signal}).catch(error=>{
  if(error instanceof DriveError&&[401,403,404].includes(error.code))return {content:[],total:0}
  throw error
 }),{refresh})
}
