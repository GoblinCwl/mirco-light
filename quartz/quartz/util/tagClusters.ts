export type GalaxyWindow = {centerX:number;centerY:number;innerRadius:number;outerRadius:number}
export type ClusterBounds = {tag:string;count:number;x:number;y:number;radius:number;phase:number;orbitRadius:number}
const clusterDarkColors=[[135,168,230],[171,141,216],[105,187,198],[215,167,136],[139,163,235],[201,137,178]]
const clusterLightColors=[[67,100,165],[121,83,163],[47,126,139],[157,107,65],[76,109,169],[153,79,126]]
export function tagClusterColors(tag:string) {
 const index=tagSeed(tag)%clusterDarkColors.length
 return {dark:clusterDarkColors[index],light:clusterLightColors[index]}
}
export function tagClusterStyle(tag:string) {
 const colors=tagClusterColors(tag)
 return `--cluster-dark:${colors.dark.join(',')};--cluster-light:${colors.light.join(',')}`
}
export function tagStarMotion(point:{x:number;y:number;phase:number;period:number},radius:number,time:number) {
 const clearance=Math.max(0,Math.abs(point.x)-Math.min(70,radius*.8),Math.abs(point.y)-26)
 const amplitude=Math.min(12,radius*.15,clearance*.4),angle=time/(point.period*4)*Math.PI*2
 return {
  x:point.x+(Math.sin(angle+point.phase)-Math.sin(point.phase))*amplitude,
  y:point.y+(Math.cos(angle*.83+point.phase)-Math.cos(point.phase))*amplitude*.62,
 }
}
export function tagClusterRadius(count:number,maxCount:number,maxRadius=130):number {
 const heat=Math.sqrt(Math.max(0,count)/Math.max(1,maxCount))
 return maxRadius*(.58+.42*Math.min(1,heat))
}
// The page is a crop of the LEFT side of a much larger annulus. Its center
// remains outside the right edge, exactly as a camera viewing one galactic arm.
export function tagGalaxyWindow(width:number,height:number):GalaxyWindow {
 const outerRadius=Math.max(width*1.65,height*1.12)
 return {centerX:outerRadius+width*.015,centerY:height/2,outerRadius,innerRadius:Math.max(outerRadius*.25,outerRadius-width*1.2)}
}
export function layoutTagRiver(tags:{tag:string;count:number}[],width:number,height:number) {
 const ordered=[...tags].sort((a,b)=>tagSeed(a.tag)-tagSeed(b.tag)),galaxy=tagGalaxyWindow(width,height)
 const maximum=Math.max(1,...tags.map(tag=>tag.count)),maxRadius=Math.min(108,width*.17)
 const band=galaxy.outerRadius-galaxy.innerRadius
 // Keep every cluster reachable in the crop even though the inner hole is
 // entirely offscreen. Reserve room for its upright HTML label at either edge.
 const margin=Math.min(78,width*.25)
 const minOrbit=Math.max(galaxy.innerRadius+band*.28,galaxy.centerX-width+margin)
 const maxOrbit=Math.min(galaxy.outerRadius-band*.06,galaxy.centerX-margin)
 const clusters:ClusterBounds[]=ordered.map((tag,index)=>{
  const random=tagRandom(tagSeed(tag.tag)),phase=Math.PI+index*Math.PI*(3-Math.sqrt(5))
  const orbitRadius=minOrbit+random()*(maxOrbit-minOrbit)
  const point={x:galaxy.centerX+Math.cos(phase)*orbitRadius,y:galaxy.centerY+Math.sin(phase)*orbitRadius}
  return {...tag,...point,radius:tagClusterRadius(tag.count,maximum,maxRadius),phase,orbitRadius}
 })
 return {clusters,galaxy}
}
export function tagFocusAngle(current:number,phase:number) {
 const delta=Math.PI-phase-current
 return current+Math.atan2(Math.sin(delta),Math.cos(delta))
}
export function tagRiverPosition(cluster:ClusterBounds,angle:number,galaxy:GalaxyWindow) {
 return {x:galaxy.centerX+Math.cos(cluster.phase+angle)*cluster.orbitRadius,y:galaxy.centerY+Math.sin(cluster.phase+angle)*cluster.orbitRadius}
}
export function tagSeed(value:string) {
 let seed=2166136261
 for(const char of value)seed=Math.imul(seed^char.charCodeAt(0),16777619)
 return seed>>>0
}
export function tagRandom(seed:number) {
 return ()=>{
  seed|=0;seed=seed+0x6D2B79F5|0
  let value=Math.imul(seed^seed>>>15,1|seed)
  value=value+Math.imul(value^value>>>7,61|value)^value
  return ((value^value>>>14)>>>0)/4294967296
 }
}
export function tagStarPositions(tag:string,ids:string[],radius:number) {
 const points:{x:number;y:number;phase:number;period:number}[]=[]
 // Spatial buckets keep dense clusters inexpensive without dropping members.
 const buckets=new Map<string,{x:number;y:number}[]>()
 const crowded=(x:number,y:number)=>{
  const gx=Math.floor(x/4),gy=Math.floor(y/4)
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(buckets.get(`${gx+dx}:${gy+dy}`)?.some(point=>Math.hypot(point.x-x,point.y-y)<4))return true
  return false
 }
 for(const id of ids){
  const random=tagRandom(tagSeed(tag+':'+id));let x=0,y=0
  for(let attempt=0;attempt<80;attempt++){
   const angle=random()*Math.PI*2,distance=Math.sqrt(.1+random()*.82)
   x=Math.cos(angle)*radius*distance;y=Math.sin(angle)*radius*.62*distance
   if(Math.abs(x)<Math.min(70,radius*.8)&&Math.abs(y)<22)continue
   if(crowded(x,y))continue
   break
  }
  if(Math.abs(x)<Math.min(70,radius*.8)&&Math.abs(y)<22)y=(y<0?-1:1)*Math.min(radius*.59,24+random()*radius*.14)
  const key=`${Math.floor(x/4)}:${Math.floor(y/4)}`,bucket=buckets.get(key)??[]
  bucket.push({x,y});buckets.set(key,bucket)
  points.push({x,y,phase:random()*Math.PI*2,period:3+random()*6})
 }
 return points
}
