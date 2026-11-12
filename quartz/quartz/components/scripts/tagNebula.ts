import {bindTagOrbitDrag} from './tagOrbitDrag'
import type {TagStats} from '../../util/tagIndex'
import {layoutTagRiver,tagRandom,tagStarPositions,tagRiverPosition,tagClusterColors,tagStarMotion,tagFocusAngle,type ClusterBounds,type GalaxyWindow} from '../../util/tagClusters'

type Cluster = ClusterBounds & {
 entry:HTMLElement;stars:ReturnType<typeof tagStarPositions>
 spark:HTMLCanvasElement;scale:number;hover:number
}
const color=(rgb:number[],alpha:number)=>`rgba(${rgb.join(',')},${alpha})`
function deepSpaceTexture(width:number,height:number,light:boolean) {
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(width);canvas.height=Math.ceil(height)
 const ctx=canvas.getContext('2d')!,random=tagRandom(68139)
 // Distant dust is much smaller and dimmer than the real project stars.
 const count=Math.min(520,Math.round(width*height/1700))
 for(let i=0;i<count;i++){
  const x=random()*width,y=random()*height,r=.25+random()*.5
  ctx.fillStyle=color(light?[73,96,130]:[174,193,228],(light ? .1 : .16)+random()*.25)
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()
  if(i%39===0){
   const ray=3+random()*2
   ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(x,y-ray);ctx.lineTo(x+.6,y-.6);ctx.lineTo(x+ray*.7,y);ctx.lineTo(x+.6,y+.6);ctx.lineTo(x,y+ray);ctx.lineTo(x-.6,y+.6);ctx.lineTo(x-ray*.7,y);ctx.lineTo(x-.6,y-.6);ctx.closePath();ctx.fill();ctx.globalAlpha=1
  }
 }
 return canvas
}
function meteorTexture(light:boolean) {
 const canvas=document.createElement('canvas');canvas.width=96;canvas.height=8
 const ctx=canvas.getContext('2d')!,rgb=light?[74,104,149]:[178,202,238],tail=ctx.createLinearGradient(0,0,96,0)
 tail.addColorStop(0,color(rgb,0));tail.addColorStop(.7,color(rgb,.35));tail.addColorStop(1,color(rgb,1))
 ctx.fillStyle=tail;ctx.beginPath();ctx.moveTo(0,4);ctx.lineTo(92,3.2);ctx.lineTo(96,4);ctx.lineTo(92,4.8);ctx.closePath();ctx.fill()
 return canvas
}
function starTexture(rgb:number[],light:boolean) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=48
 const ctx=canvas.getContext('2d')!,core=light?color(rgb,1):'rgba(255,255,255,1)'
 const glow=ctx.createRadialGradient(24,24,0,24,24,17)
 glow.addColorStop(0,color(rgb,.6));glow.addColorStop(.3,color(rgb,.2));glow.addColorStop(1,color(rgb,0))
 ctx.fillStyle=glow;ctx.fillRect(0,0,48,48)
 // Four tapered diffraction rays give project stars a distinct silhouette.
 const rays=ctx.createRadialGradient(24,24,0,24,24,23)
 rays.addColorStop(0,core);rays.addColorStop(.14,color(rgb,1));rays.addColorStop(.6,color(rgb,.55));rays.addColorStop(1,color(rgb,0))
 ctx.fillStyle=rays;ctx.beginPath()
 ctx.moveTo(24,1);ctx.lineTo(26,22);ctx.lineTo(43,24);ctx.lineTo(26,26)
 ctx.lineTo(24,47);ctx.lineTo(22,26);ctx.lineTo(5,24);ctx.lineTo(22,22)
 ctx.closePath();ctx.fill()
 ctx.fillStyle=core;ctx.beginPath();ctx.arc(24,24,1.7,0,Math.PI*2);ctx.fill()
 return canvas
}

type RiverFlow = {
 start:number;length:number;base:number;band:number;phase:number;spread:number
 rgb:number[];lineWidth:number;speed:number;offset:number;span:number;kind:'thread'|'fork'|'ribbon'
}
type RiverLayer = {texture:HTMLCanvasElement;flows:RiverFlow[]}
function riverRadius(angle:number,path:Pick<RiverFlow,'base'|'band'|'phase'|'spread'>) {
 const {base,band,phase,spread}=path
 const shared=Math.sin(angle*2+.6)*.038+Math.cos(angle*3-.8)*.016
 const braid=Math.sin(angle*3+phase)*.052+Math.sin(angle*5-phase)*.012
 const gathering=.35+.65*(.5+.5*Math.sin(angle*2+phase))
 return Math.min(GALAXY_TEXTURE_RADIUS-2,base+band*(shared+braid+spread*gathering))
}
function drawRiverFlow(ctx:CanvasRenderingContext2D,flows:RiverFlow[],time:number,light:boolean) {
 const matrix=ctx.getTransform(),scale=Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d))
 for(const path of flows){
  const distance=(path.offset+time*path.speed+.035*Math.sin(time*.7+path.phase))%path.length
  const span=path.span*(path.kind==='ribbon'?1.7:1)*(.85+.15*Math.sin(time*.8+path.phase)),head=path.start+distance,tail=Math.max(path.start,head-span)
  const alpha=Math.min(1,distance/span,(path.length-distance)/span)
  if(alpha<=0)continue
  const radius=riverRadius(head,path),x=Math.cos(head)*radius,y=Math.sin(head)*radius
  const screenX=matrix.a*x+matrix.c*y+matrix.e,screenY=matrix.b*x+matrix.d*y+matrix.f,margin=span*GALAXY_TEXTURE_RADIUS*scale+4
  if(screenX < -margin||screenY < -margin||screenX > ctx.canvas.width+margin||screenY > ctx.canvas.height+margin)continue
  const rgb=path.rgb.map(channel=>Math.round(channel*.72+(light?125:245)*.28))
  const gradient=ctx.createConicGradient(tail,0,0),end=(head-tail)/(Math.PI*2)
  gradient.addColorStop(0,color(rgb,0));gradient.addColorStop(end*.75,color(rgb,alpha*(light ? .55 : .75)))
  gradient.addColorStop(end,color(rgb,0));gradient.addColorStop(1,color(rgb,0))
  ctx.strokeStyle=gradient;ctx.lineWidth=Math.max(.6,path.lineWidth*(path.kind==='ribbon'?1.6:1.25));ctx.lineCap='round'
  const stroke=(branch=0)=>{
   ctx.beginPath()
   for(let i=0;i<=18;i++){
    const progress=i/18,angle=tail+(head-tail)*progress
    const r=riverRadius(angle,path)+branch*Math.pow(1-progress,1.6),px=Math.cos(angle)*r,py=Math.sin(angle)*r
    if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py)
   }
   ctx.stroke()
  }
  stroke()
  if(path.kind==='fork'){
   const width=path.band*.009*(.8+.2*Math.sin(time*.5+path.phase))
   ctx.save();ctx.globalAlpha*=.4;ctx.lineWidth*=.6;stroke(-width);stroke(width);ctx.restore()
  }
 }
}

const GALAXY_TEXTURE_SIZE=2048,GALAXY_TEXTURE_RADIUS=880
function riverTexture(light:boolean,galaxy:GalaxyWindow,layer:number,flows?:RiverFlow[]) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=GALAXY_TEXTURE_SIZE
 const ctx=canvas.getContext('2d')!,random=tagRandom(73129+layer*1973),outer=GALAXY_TEXTURE_RADIUS,inner=outer*galaxy.innerRadius/galaxy.outerRadius,band=outer-inner
 const flowRandom=tagRandom(95617+layer*1249)
 const palette=light?[[67,107,183],[128,76,181],[173,72,135],[30,129,151],[167,115,49]]:[[106,161,255],[185,127,250],[237,133,196],[83,211,228],[238,185,105]]
 ctx.translate(GALAXY_TEXTURE_SIZE/2,GALAXY_TEXTURE_SIZE/2)
 // Crisp, open filaments define the galaxy; project stars remain the focal points.
 // Related filaments share a spine, then gather and peel away from it.
 // More material follows the inner spines; loose outer strands keep the crop open.
 for(let strand=0;strand<54;strand++){
  const radial=.12+Math.pow(random(),1.35)*.81,bundle=Math.min(4,Math.floor(radial*5)),core=1-radial,feather=strand%7===0
  const spread=(random()-.5)*(feather ? .15 : .075),phase=bundle*1.36+.5+layer*.18
  const tone=palette[(bundle+layer+(feather?2:0))%palette.length]
  const pale=strand%13===3,rgb=pale?(light?[121,143,170]:[184,209,236]):tone,base=inner+band*radial
  const start=random()*Math.PI*2,length=feather ? .28+random()*.85 : strand%11===0?3.2+random()*1.3:1.35+random()*2
  // Keep the strand bright; short local fades soften irregular missing pieces.
  const gradient=ctx.createConicGradient(start,0,0),end=length/(Math.PI*2)
  const opacity=((pale?(light ? .34 : .48):(light ? .28 : .4))+random()*.07)*(feather ? .65 : 1)
  gradient.addColorStop(0,color(rgb,0));gradient.addColorStop(end*.035,color(rgb,opacity))
  if(strand%4===0&&!feather){
   const gap=.25+random()*.5,half=.025+random()*.035
   gradient.addColorStop(end*(gap-half-.018),color(rgb,opacity))
   gradient.addColorStop(end*(gap-half),color(rgb,0))
   gradient.addColorStop(end*(gap+half),color(rgb,0))
   gradient.addColorStop(end*(gap+half+.018),color(rgb,opacity))
  }
  gradient.addColorStop(end*.965,color(rgb,opacity));gradient.addColorStop(end,color(rgb,0));gradient.addColorStop(1,color(rgb,0))
  const lineWidth=pale ? .6+random()*.35 : (.35+random()*(strand%11===0?1.65:.8))*(.65+core*.65)
  ctx.strokeStyle=gradient;ctx.lineWidth=lineWidth
  const path:RiverFlow={start,length,base,band,phase,spread,rgb,lineWidth,kind:strand%12===0?'fork':strand%9===0?'ribbon':'thread',speed:.12+flowRandom()*.09,offset:flowRandom()*length,span:.05+flowRandom()*.05}
  if(strand%3===0&&!feather)flows?.push(path)
  ctx.beginPath()
  for(let i=0;i<=180;i++){
   const angle=start+i/180*length
   const radius=riverRadius(angle,path)
   const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius
   if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)
  }
  ctx.stroke()
 }
 return canvas
}

export function setupTagNebula(root:HTMLElement,stats:TagStats) {
 const stage=root.querySelector<HTMLElement>('[data-tag-nebula]')!,canvas=stage.querySelector<HTMLCanvasElement>('canvas')!,ctx=canvas.getContext('2d')!
 const lifecycle=new AbortController(),signal=lifecycle.signal,reduced=matchMedia('(prefers-reduced-motion:reduce)')
 const entries=new Map([...stage.querySelectorAll<HTMLElement>('[data-tag-name]')].map(entry=>[entry.dataset.tagName!,entry]))
 let clusters:Cluster[]=[],width=0,height=0,frame=0,last=0,disposed=false,light=false
 const start=performance.now()
 const angularSpeed=.021
 let galaxy:GalaxyWindow={centerX:0,centerY:0,innerRadius:1,outerRadius:1}
 let flowTime=0,lastFlow=0,stageVisible=false,rotationOffset=0,wheelAngle=0,inertiaVelocity=0,resizeTimer:ReturnType<typeof setTimeout>|undefined
 let pointer:{x:number;y:number}|undefined,space:HTMLCanvasElement|undefined,meteor:HTMLCanvasElement|undefined
 let rivers:RiverLayer[]=[]
 let focusMotion:{from:number;target:number;elapsed:number;duration:number;arrived?:()=>void}|undefined
 let drag:{id:number;x:number;y:number;lastX:number;lastY:number;lastTime:number;velocity:number;active:boolean}|undefined,suppressClick=false
 const freeTextures=()=>{for(const river of rivers)river.texture.width=0;rivers=[];space&&(space.width=0);meteor&&(meteor.width=0);for(const cluster of clusters){cluster.spark.width=0}}
 const positionClusters=()=>{
  const travel=flowTime*angularSpeed+rotationOffset
  clusters.forEach(cluster=>{
   const position=tagRiverPosition(cluster,travel,galaxy)
   cluster.x=position.x;cluster.y=position.y
   cluster.entry.style.transform=`translate3d(${cluster.x.toFixed(2)}px,${cluster.y.toFixed(2)}px,0) translate(-50%,-50%)`
  })
 }
 const rebuild=()=>{
  if(disposed||stage.clientWidth<1)return
  width=stage.clientWidth;height=stage.clientHeight
  const layout=layoutTagRiver(stats.counts,width,height);galaxy=layout.galaxy
  const ratio=Math.min(devicePixelRatio||1,1.5)
  canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0)
  light=document.documentElement.getAttribute('saved-theme')!=='dark'
  freeTextures();rivers=[0,1,2].map(layer=>{const flows:RiverFlow[]=[];return {texture:riverTexture(light,galaxy,layer,flows),flows}});space=deepSpaceTexture(width,height,light);meteor=meteorTexture(light)
  clusters=layout.clusters.map(bounds=>{
   const rgb=tagClusterColors(bounds.tag)[light?'light':'dark'],entry=entries.get(bounds.tag)!
   const members=stats.counts.find(item=>item.tag===bounds.tag)?.members??[]
   entry.style.width=`${bounds.radius*2}px`;entry.style.height=`${bounds.radius*1.5}px`
   return {...bounds,entry,stars:tagStarPositions(bounds.tag,members,bounds.radius),spark:starTexture(rgb,light),scale:1,hover:0}
  })
  positionClusters();requestPaint()
 }
 function paint(now:number) {
  frame=0;if(disposed||document.hidden)return
  const delta=lastFlow?Math.min((now-lastFlow)/1000,.12):1/24
  if(!reduced.matches&&lastFlow&&!drag?.active)flowTime+=delta
  // Ease manual navigation into the same orbit used by automatic drift.
  const wheelStep=wheelAngle*(reduced.matches?1:1-Math.exp(-delta/.22))
  rotationOffset+=wheelStep;wheelAngle-=wheelStep
  if(Math.abs(wheelAngle)<.00001)wheelAngle=0
  if(reduced.matches)inertiaVelocity=0
  if(!drag?.active&&inertiaVelocity!==0){
   const decay=Math.exp(-delta/.42)
   rotationOffset+=inertiaVelocity*.42*(1-decay)
   inertiaVelocity*=decay
   if(Math.abs(inertiaVelocity)<.0005)inertiaVelocity=0
  }
  if(focusMotion){
   const motion=focusMotion
   motion.elapsed+=delta
   const progress=reduced.matches?1:Math.min(1,motion.elapsed/motion.duration)
   const eased=progress*progress*(3-2*progress)
   rotationOffset=motion.from+(motion.target-motion.from)*eased-flowTime*angularSpeed
   if(progress===1){focusMotion=undefined;motion.arrived?.()}
  }
  lastFlow=now
  const elapsed=(now-start)/1000,box=stage.getBoundingClientRect(),travel=flowTime*angularSpeed+rotationOffset
  positionClusters();ctx.clearRect(0,0,width,height)
  if(space)ctx.drawImage(space,0,0,width,height)
  // Sparse distant motion shares the scene clock and its visibility lifecycle.
  const meteorPhase=(flowTime+19)%23,meteorCycle=Math.floor((flowTime+19)/23)
  if(meteor&&!reduced.matches&&meteorPhase<1.8){
   const progress=meteorPhase/1.8,side=meteorCycle%2
   ctx.save();ctx.globalAlpha=Math.sin(progress*Math.PI)*.45
   ctx.translate(width*(side ? .12 : .72)+progress*width*.2,height*(side ? .22 : .68)+progress*height*.1)
   ctx.rotate(.55);ctx.drawImage(meteor,-64,-3,64,6);ctx.restore()
  }
  for(const [layer,river] of rivers.entries()){
   const phase=layer*Math.PI*2/3
   const weave=reduced.matches?0:(Math.sin(flowTime*.38+phase)-Math.sin(phase))*.024+flowTime*(layer-1)*.0018
   const dilation=reduced.matches?1:1+Math.sin(flowTime*.28+phase)*.006
   ctx.save();ctx.translate(galaxy.centerX,galaxy.centerY);ctx.rotate(travel+weave);ctx.scale(dilation,dilation)
   const diameter=galaxy.outerRadius*GALAXY_TEXTURE_SIZE/GALAXY_TEXTURE_RADIUS
   ctx.drawImage(river.texture,-diameter/2,-diameter/2,diameter,diameter)
   if(!reduced.matches){
    ctx.save();ctx.scale(galaxy.outerRadius/GALAXY_TEXTURE_RADIUS,galaxy.outerRadius/GALAXY_TEXTURE_RADIUS)
    drawRiverFlow(ctx,river.flows,flowTime,light);ctx.restore()
   }
   ctx.restore()
  }
  for(const [clusterIndex,cluster] of clusters.entries()){
   if(cluster.y+cluster.radius<0||cluster.y-cluster.radius>height||cluster.x+cluster.radius<0||cluster.x-cluster.radius>width)continue
   if(pointer){const x=pointer.x-box.left,y=pointer.y-box.top;cluster.entry.classList.toggle('is-hovered',((x-cluster.x)/cluster.radius)**2+((y-cluster.y)/(cluster.radius*.72))**2<1)}
   const active=cluster.entry.classList.contains('is-hovered')||cluster.entry.matches(':focus-within')||cluster.entry.classList.contains('is-located')
   cluster.hover=active?(cluster.hover||now):0
   cluster.scale=reduced.matches?(active?1.035:1):cluster.scale+(active?1.035-cluster.scale:1-cluster.scale)*.14
   ctx.save();ctx.translate(cluster.x,cluster.y);ctx.scale(cluster.scale,cluster.scale)
   for(const [index,point] of cluster.stars.entries()){
    const twinkle=reduced.matches ? .95 : .8+.18*Math.sin(elapsed/point.period*Math.PI*2+point.phase)
    const enter=reduced.matches?1:Math.min(1,Math.max(0,(elapsed-Math.min(clusterIndex*.025,.5)-.1-index%9*.065)/.65))
    const enhanced=active?(reduced.matches?1:Math.min(1,Math.max(0,(now-cluster.hover)/650-index/Math.max(1,cluster.stars.length)*.7))):0
    ctx.globalAlpha=enter*Math.min(1,twinkle+enhanced*.35)
    const size=16+(index%4)*1.6+enhanced*3
    const position=reduced.matches?point:tagStarMotion(point,cluster.radius,flowTime)
    ctx.drawImage(cluster.spark,position.x-size/2,position.y-size/2,size,size)
   }
   ctx.restore()
  }
  if(!frame&&stageVisible&&(!reduced.matches||wheelAngle!==0||focusMotion))frame=requestAnimationFrame(tick)
 }
 function tick(now:number){if(now-last<1000/24){frame=requestAnimationFrame(tick);return}last=now;paint(now)}
 function requestPaint(){if(!disposed&&!document.hidden&&!frame)frame=requestAnimationFrame(paint)}
 const focus=(tag:string,arrived?:()=>void)=>{
  const cluster=clusters.find(cluster=>cluster.tag===tag);if(!cluster)return
  wheelAngle=0;inertiaVelocity=0
  const from=flowTime*angularSpeed+rotationOffset,target=tagFocusAngle(from,cluster.phase)
  if(reduced.matches||Math.abs(target-from)<.001){
   focusMotion=undefined;rotationOffset=target-flowTime*angularSpeed;positionClusters();arrived?.()
  }else focusMotion={from,target,elapsed:0,duration:.65+Math.min(.8,Math.abs(target-from)*.25),arrived}
  requestPaint()
 }
 const queueResize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(rebuild,120)}
 const resize=new ResizeObserver(()=>{if(stage.clientWidth!==width||stage.clientHeight!==height)queueResize()});resize.observe(stage)
 const sceneObserver=new IntersectionObserver(items=>{stageVisible=items[0]?.isIntersecting??false;if(!stageVisible)lastFlow=0;requestPaint()});sceneObserver.observe(stage)
 window.addEventListener('resize',queueResize,{signal})
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;lastFlow=0}else requestPaint()},{signal})
 document.addEventListener('themechange',rebuild,{signal})
 reduced.addEventListener('change',()=>{cancelAnimationFrame(frame);frame=0;requestPaint()},{signal})
 stage.addEventListener('wheel',event=>{
  // Leave browser zoom and horizontal trackpad gestures untouched.
  if(event.ctrlKey||!event.deltaY||Math.abs(event.deltaX)>Math.abs(event.deltaY))return
  if(event.cancelable)event.preventDefault()
  const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?height:1)
  focusMotion=undefined;inertiaVelocity=0
  wheelAngle+=Math.max(-height,Math.min(height,pixels))/galaxy.outerRadius
  requestPaint()
 },{signal,passive:false})
 bindTagOrbitDrag(stage,signal,{
 start(id,x,y){
  drag={id,x,y,lastX:x,lastY:y,lastTime:performance.now(),velocity:0,active:false}
  focusMotion=undefined;inertiaVelocity=0;wheelAngle=0;suppressClick=false
 },
 move(id,x,y,threshold){
  if(!drag||id!==drag.id)return false
  if(!drag.active&&Math.hypot(x-drag.x,y-drag.y)<threshold)return false
  if(!drag.active){drag.active=true;wheelAngle=0;stage.classList.add('is-dragging')}
  const box=stage.getBoundingClientRect(),centerX=box.left+galaxy.centerX,centerY=box.top+galaxy.centerY
  const previous=Math.atan2(drag.lastY-centerY,drag.lastX-centerX)
  const current=Math.atan2(y-centerY,x-centerX)
  const movement=Math.atan2(Math.sin(current-previous),Math.cos(current-previous)),now=performance.now()
  const seconds=Math.max(.008,(now-drag.lastTime)/1000)
  const velocity=Math.max(-1.8,Math.min(1.8,movement/seconds))
  drag.velocity=seconds>.12?velocity:drag.velocity*.45+velocity*.55
  drag.lastTime=now;rotationOffset+=movement
  drag.lastX=x;drag.lastY=y;requestPaint();return true
 },
 end(id,inertia){
  if(!drag||drag.id!==id)return
  inertiaVelocity=drag.active&&inertia&&!reduced.matches&&performance.now()-drag.lastTime<100?drag.velocity:0
  suppressClick=drag.active;drag=undefined;stage.classList.remove('is-dragging');requestPaint()
 }
 })
 stage.addEventListener('dragstart',event=>event.preventDefault(),{signal})
 stage.addEventListener('click',event=>{
  if(!suppressClick)return
  suppressClick=false;event.preventDefault();event.stopImmediatePropagation()
 },{signal,capture:true})
 stage.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'){pointer={x:event.clientX,y:event.clientY};requestPaint()}},{signal,passive:true})
 stage.addEventListener('pointerleave',()=>{pointer=undefined;for(const cluster of clusters)cluster.entry.classList.remove('is-hovered');requestPaint()},{signal})
 stage.addEventListener('focusin',event=>{
  const entry=event.target instanceof Element?event.target.closest<HTMLElement>('[data-tag-name]'):null
  const cluster=clusters.find(cluster=>cluster.entry===entry)
  if(cluster&&(cluster.y<30||cluster.y>height-30||cluster.x<30||cluster.x>width-30))focus(cluster.tag)
  requestPaint()
 },{signal})
 rebuild()
 return {focus,refresh:requestPaint,dispose:()=>{disposed=true;lifecycle.abort();resize.disconnect();sceneObserver.disconnect();cancelAnimationFrame(frame);clearTimeout(resizeTimer);freeTextures();canvas.width=canvas.height=0}}
}
