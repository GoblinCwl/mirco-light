import type {DriveView} from './driveClient'
export function showShareGraph(view:DriveView,unlocked:boolean,mediaPending:boolean,hasMedia:boolean){
 return view==='share'&&!hasMedia&&(!unlocked||!mediaPending)
}
