import {deepSpaceTexture} from './deepSpaceTexture'
import {tagRandom} from '../../util/tagClusters'

/** A sticky viewport inside the reading region keeps scrolling/pagination off the canvas path. */
export function setupReadingSpace(root:HTMLElement,signal:AbortSignal){
 const canvas=root.querySelector<HTMLCanvasElement>('canvas.reading-space'),ctx=canvas?.getContext('2d')
 if(!canvas||!ctx)return
 const host=document.createElement('div'),layer=document.createElement('div'),twinkles=document.createElement('div')
 host.className='reading-space-host';host.setAttribute('aria-hidden','true')
 layer.className='reading-space-layer';twinkles.className='reading-space reading-space-twinkles'
 canvas.before(host);host.append(layer);layer.append(canvas,twinkles)
 let version='',frame=0
 const paint=()=>{
  frame=0;if(signal.aborted)return
  const box=root.getBoundingClientRect(),viewport=document.documentElement.clientWidth
  const left=Math.max(0,Math.min(viewport-1,Math.floor(box.left-16))),right=Math.min(viewport,Math.ceil(box.right+16))
  // 100lvh stays constant as mobile browser controls appear/disappear.
  const width=Math.max(1,right-left),height=Math.max(1,layer.clientHeight)
  const light=document.documentElement.getAttribute('saved-theme')!=='dark',ratio=Math.min(devicePixelRatio||1,1.5)
  const next=`${width}:${height}:${ratio}:${light}`
  if(next===version)return
  version=next;host.style.left=`${left-box.left}px`;host.style.width=`${width}px`
  canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio)
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
 // Page growth no longer invalidates the star field; only its viewport dimensions matter.
 const size=new ResizeObserver(schedule);size.observe(layer)
 const theme=new MutationObserver(schedule);theme.observe(document.documentElement,{attributes:true,attributeFilter:['saved-theme']})
 window.addEventListener('resize',schedule,{signal,passive:true})
 signal.addEventListener('abort',()=>{cancelAnimationFrame(frame);size.disconnect();theme.disconnect();host.before(canvas);host.remove()},{once:true})
 paint()
}

/** Begin before the header reaches the viewport, so returning to the top has no empty wait. */
export function setupReadingHorizon(root:HTMLElement,signal:AbortSignal){
 const scene=root.querySelector<HTMLElement>('.reading-horizon-scene');if(!scene)return
 const observer=new IntersectionObserver(entries=>{
  if(signal.aborted||document.documentElement.classList.contains('mobile-no-scroll'))return
  for(const entry of entries){
   scene.toggleAttribute('data-horizon-outside',!entry.isIntersecting)
   scene.setAttribute('data-horizon-ready','')
  }
 },{threshold:0,rootMargin:"200px 0px 0px 0px"})
 observer.observe(scene)
 signal.addEventListener('abort',()=>{observer.disconnect();scene.removeAttribute('data-horizon-outside');scene.removeAttribute('data-horizon-ready')},{once:true})
}
