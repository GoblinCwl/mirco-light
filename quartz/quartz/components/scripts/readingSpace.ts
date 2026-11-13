import {deepSpaceTexture} from './deepSpaceTexture'
import {tagRandom} from '../../util/tagClusters'

/** Fixed stars are clipped to the reading column, never the whole site's navigation. */
export function setupReadingSpace(root:HTMLElement,signal:AbortSignal){
 const canvas=root.querySelector<HTMLCanvasElement>('.reading-space')!,ctx=canvas.getContext('2d')
 if(!ctx)return
 const twinkles=document.createElement('div')
 twinkles.className='reading-space reading-space-twinkles';twinkles.setAttribute('aria-hidden','true');canvas.after(twinkles)
 let version='',frame=0
 const paint=()=>{
  frame=0;if(signal.aborted)return
  const box=root.getBoundingClientRect(),viewport=document.documentElement.clientWidth
  const left=Math.max(0,Math.min(viewport-1,Math.floor(box.left-16))),right=Math.min(viewport,Math.ceil(box.right+16))
  const width=Math.max(1,right-left),height=Math.max(1,innerHeight)
  const light=document.documentElement.getAttribute('saved-theme')!=='dark',ratio=Math.min(devicePixelRatio||1,1.5)
  canvas.style.left=`${left}px`;canvas.style.width=`${width}px`
  canvas.style.clipPath=`inset(${Math.min(height,Math.max(0,box.top-32))}px 0 ${Math.min(height,Math.max(0,height-box.bottom-32))}px 0)`
  twinkles.style.left=canvas.style.left;twinkles.style.width=canvas.style.width;twinkles.style.clipPath=canvas.style.clipPath
  const next=`${width}:${height}:${ratio}:${light}`
  if(next===version)return
  version=next;canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio)
  const random=tagRandom(53271)
  twinkles.replaceChildren()
  for(let i=0;i<Math.min(24,Math.round(width*height/35000));i++){
   const star=document.createElement('i'),size=.9+random()*.8
   star.style.cssText=`left:${random()*100}%;top:${random()*100}%;width:${size}px;height:${size}px;animation-duration:${7+random()*9}s;animation-delay:-${random()*18}s`
   twinkles.append(star)
  }
  ctx.setTransform(ratio,0,0,ratio,0,0)
  const stars=deepSpaceTexture(width,height,light,true)
  ctx.clearRect(0,0,width,height);ctx.drawImage(stars,0,0,width,height);stars.width=stars.height=0
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(paint)}
 const size=new ResizeObserver(schedule);size.observe(root)
 const theme=new MutationObserver(schedule);theme.observe(document.documentElement,{attributes:true,attributeFilter:['saved-theme']})
 window.addEventListener('resize',schedule,{signal,passive:true});window.addEventListener('scroll',schedule,{signal,passive:true})
 signal.addEventListener('abort',()=>{cancelAnimationFrame(frame);size.disconnect();theme.disconnect();twinkles.remove()},{once:true})
 paint()
}
