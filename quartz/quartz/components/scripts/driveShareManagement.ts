import type {ActionContext,ActionEntry} from './driveActions'
import {driveRoute,driveHref} from '../../util/driveRoutes.mjs'
// Only a single share selected on the merged Share homepage is manageable.
export function managedShareTarget(context:Pick<ActionContext,'view'|'path'|'share'|'selected'>):ActionEntry|undefined{
 if(context.view!=='guest'||context.path!=='/')return
 if(context.selected.length!==1||!context.selected[0].shared)return
 try{
  const origin=typeof location==='undefined'?'https://quartz.invalid':location.origin
  const url=new URL(context.selected[0].target,origin),route=driveRoute(url)
  if(url.origin!==origin)return
  if(!route.valid||route.view!=='share'||route.path!=='/')return
  return {...context.selected[0],name:route.share,target:driveHref('share','/',route.share)}
 }catch{return}
}
