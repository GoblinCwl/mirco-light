function random(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
const round=(n:number)=>Math.round(n*100)/100
export function horizonFilaments(){
 const next=random(84613)
 return Array.from({length:190},(_,index)=>{
  const hot=index<24,long=index>=24&&index<85
  const choice=next(),region=hot?'ribbon':choice<.66?'right':choice<.9?'left':'ribbon'
  const spread=hot?(next()-.5)*16:region==='ribbon'?(next()-.25)*15:next()*48
  const cx=500,cy=-330,k=.55228475
  const left=600+spread*(hot?.5:1),middle=600+spread*(hot?.85:1),right=600+spread*(hot?2.4:1)
  let path=`M${round(cx-left)} ${cy}C${round(cx-left)} ${round(cy+k*left)} ${round(cx-k*middle)} ${round(cy+middle)} ${cx} ${round(cy+middle)}C${round(cx+k*middle)} ${round(cy+middle)} ${round(cx+right)} ${round(cy+k*right)} ${round(cx+right)} ${cy}`
  if(region!=='ribbon'){
   const radius=600+spread,start=region==='right'?1.08+next()*.25:3.05-next()*.1,end=region==='right'?.08:1.77+next()*.16
   path=`M${round(cx+Math.cos(start)*radius)} ${round(cy+Math.sin(start)*radius)}A${round(radius)} ${round(radius)} 0 0 0 ${round(cx+Math.cos(end)*radius)} ${round(cy+Math.sin(end)*radius)}`
  }
  const dashes=Array.from({length:14},(_,i)=>round(i%2?5+next()*24:1+next()*(i%4===0?32:12))).join(' ')
  const strength=region==='left'?.58:region==='right'?1.25:1
  return {path,region,kind:hot?'core':long?'long':'short',width:round(hot?.65+next()*2.1:(.23+next()*.65)*(region==='right'?1.25:.8)),opacity:round(Math.min(.9,(hot?.4+next()*.48:long?.12+next()*.36:.09+next()*.25)*strength)),dashes,offset:round(next()*600),duration:round(70+next()*110)}
 })
}
export function horizonStars(){
 const next=random(68139)
 return Array.from({length:220},()=>({x:round(next()*1000),y:round(next()*400),radius:round(.18+next()*.55),opacity:round(.12+next()*.43)}))
}

export function horizonShadowPath(){
 return 'M-105-330a605 605 0 1 0 1210 0a605 605 0 1 0-1210 0Z'
}
