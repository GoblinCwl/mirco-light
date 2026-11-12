import {tagRandom} from '../../util/tagClusters'
const color=(rgb:number[],alpha:number)=>`rgba(${rgb.join(',')},${alpha})`
export function deepSpaceTexture(width:number,height:number,light:boolean) {
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
