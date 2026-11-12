export type TagCamera = {x:number;y:number;scale:number}
export const tagCameraOverview = ():TagCamera => ({x:0,y:0,scale:1})
export function tagCameraTarget(point:{x:number;y:number},width:number,height:number,scale=1.5):TagCamera {
 return {x:(width/2-point.x)*scale,y:(height/2-point.y)*scale,scale}
}
export function projectTagPoint(point:{x:number;y:number},camera:TagCamera,width:number,height:number) {
 return {x:(point.x-width/2)*camera.scale+width/2+camera.x,y:(point.y-height/2)*camera.scale+height/2+camera.y}
}
export function interpolateTagCamera(from:TagCamera,to:TagCamera,progress:number):TagCamera {
 const t=Math.max(0,Math.min(1,progress)),eased=t*t*(3-2*t)
 return {x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased,scale:from.scale+(to.scale-from.scale)*eased}
}
