import {driveRoute} from '../../util/driveRoutes.mjs'
export function canDownloadDriveEntry(entry:{target:string;portal?:boolean;protectedShare?:boolean},unlocked:(id:string)=>boolean):boolean{
 if(entry.portal)return false
 if(!entry.protectedShare)return true
 const route=driveRoute(new URL(entry.target,'https://quartz.invalid'))
 return route.valid&&route.view==='share'&&unlocked(route.share)
}
