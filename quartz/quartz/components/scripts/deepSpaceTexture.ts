import {tagRandom} from '../../util/tagClusters'
const color=(rgb:number[],alpha:number)=>`rgba(${rgb.join(',')},${alpha})`
export function deepSpaceTexture(width:number,height:number,light:boolean, prominent=false) {
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(width);canvas.height=Math.ceil(height)
 const ctx=canvas.getContext('2d')!,random=tagRandom(68139)
 // Distant dust is much smaller and dimmer than the real project stars.
 const count=Math.min(prominent?900:520,Math.round(width*height/(prominent?1100:1700)))
 for(let i=0;i<count;i++){
  const x=random()*width,y=random()*height,r=(prominent?.45:.25)+random()*(prominent?.8:.5)
  ctx.fillStyle=color(light?[73,96,130]:[174,193,228],(prominent?(light?.28:.35):(light?.1:.16))+random()*(prominent?.35:.25))
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()
  if(i%(prominent?29:39)===0){
   const ray=3+random()*2
   ctx.globalAlpha=prominent?.75:.45;ctx.beginPath();ctx.moveTo(x,y-ray);ctx.lineTo(x+.6,y-.6);ctx.lineTo(x+ray*.7,y);ctx.lineTo(x+.6,y+.6);ctx.lineTo(x,y+ray);ctx.lineTo(x-.6,y+.6);ctx.lineTo(x-ray*.7,y);ctx.lineTo(x-.6,y-.6);ctx.closePath();ctx.fill();ctx.globalAlpha=1
  }
 }
 return canvas
}
