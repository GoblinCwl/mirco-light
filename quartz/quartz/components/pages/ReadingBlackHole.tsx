import {horizonFilaments,horizonShadowPath} from '../scripts/readingHorizonArt'
/** Native animated filaments: broad hot ribbon, continuous fine strands and drifting broken light. */
export default function ReadingBlackHole(){
 const lines=horizonFilaments()
 const shadow=horizonShadowPath()
 // Complete rings keep the texture continuous throughout an actual revolution.
 const orbitRadius=(line:typeof lines[number])=>{
  const arc=line.path.match(/A([\d.]+)/)
  return arc?Number(arc[1]):500-Number(line.path.match(/^M(-?[\d.]+)/)![1])
 }
 return <header class="reading-horizon">
  <div class="reading-horizon-scene">
   <div class="reading-horizon-entrance">
   <svg class="reading-horizon-art" viewBox="-70 0 1140 400" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
    <defs>
     <linearGradient id="horizon-density" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0"><stop stop-color="#626262"/><stop offset=".4" stop-color="#999"/><stop offset=".78" stop-color="white"/></linearGradient>
     <mask id="horizon-density-mask" maskUnits="userSpaceOnUse" x="-100" y="-300" width="1200" height="800"><rect x="-100" y="-300" width="1200" height="800" fill="url(#horizon-density)"/></mask>
     <linearGradient id="horizon-right-light" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0"><stop offset=".4" stop-color="black"/><stop offset=".72" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity=".3"/></linearGradient>
     <mask id="horizon-right-light-mask" maskUnits="userSpaceOnUse" x="-100" y="-300" width="1200" height="800"><rect x="-100" y="-300" width="1200" height="800" fill="url(#horizon-right-light)"/></mask>
     <radialGradient id="horizon-interior" cx=".5" cy=".05" r=".95"><stop stop-color="#010207"/><stop offset=".64" stop-color="#03060d"/><stop offset="1" stop-color="#0b1220"/></radialGradient>
     <radialGradient id="horizon-penumbra"><stop stop-color="#102039" stop-opacity=".26"/><stop offset="1" stop-color="#030710" stop-opacity="0"/></radialGradient>
     <clipPath id="horizon-interior-clip"><path d={shadow} transform="translate(0 -10)"/></clipPath>
     <filter id="horizon-interior-texture" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .018" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values=".025 0 0 0 0  0 .04 0 0 0  0 0 .07 0 0  0 0 0 .18 0"/></filter>
     <linearGradient id="horizon-edge-fade" gradientUnits="userSpaceOnUse" x1="-70" y1="0" x2="1070" y2="0"><stop stop-color="white" stop-opacity="0"/><stop offset=".025" stop-color="white"/><stop offset=".975" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>
     <mask id="horizon-exterior" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="-200" y="-500" width="1400" height="1100"><rect x="-200" y="-500" width="1400" height="1100" fill="url(#horizon-edge-fade)"/><path d={shadow} transform="translate(0 -10)" fill="black"/></mask>
     <linearGradient id="horizon-gas"><stop stop-color="#7f91b8" stop-opacity=".1"/><stop offset=".12" stop-color="#d1a37d" stop-opacity=".55"/><stop offset=".4" stop-color="#f1cf9f" stop-opacity=".8"/><stop offset=".78" stop-color="#fff2d5"/><stop offset="1" stop-color="#d9af85" stop-opacity=".15"/></linearGradient>
     <linearGradient id="horizon-hot"><stop stop-color="#d0a07c" stop-opacity=".1"/><stop offset=".15" stop-color="#ffe6c5" stop-opacity=".7"/><stop offset=".44" stop-color="#fffdf4"/><stop offset=".78" stop-color="#fffef7"/><stop offset="1" stop-color="#f4c995" stop-opacity=".1"/></linearGradient>
     <filter id="horizon-bloom" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
     <filter id="horizon-halo" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2"/></filter>
    </defs>
    <g class="reading-horizon-lens" transform="translate(0 24)">
    <path class="reading-horizon-core" d={shadow} transform="translate(0 -10)" fill="url(#horizon-interior)"/>
    <g clip-path="url(#horizon-interior-clip)">
     <ellipse cx="510" cy="210" rx="430" ry="180" fill="url(#horizon-penumbra)"/>
     <rect x="0" y="0" width="1000" height="400" filter="url(#horizon-interior-texture)" opacity=".45"/>
    </g>
    <g mask="url(#horizon-exterior)">
    <path class="reading-horizon-contour" d={lines[8].path} fill="none" stroke="var(--horizon-contour)" stroke-width="23" opacity=".15" filter="url(#horizon-bloom)"/>
    <g fill="none" stroke="url(#horizon-gas)" filter="url(#horizon-bloom)">
     {lines.filter((_,i)=>i<18&&i%3===0).map(line=><path d={line.path} stroke-width="12" opacity=".36"/>)}
    </g>
    <g fill="none" stroke="url(#horizon-gas)">
     {lines.filter(line=>line.kind==='long').map(line=><path d={line.path} stroke-width={line.width} opacity={line.opacity}/>)}
    </g>
    <g mask="url(#horizon-density-mask)">
     <g class="reading-horizon-spin" fill="none" stroke="url(#horizon-gas)">
      {lines.filter(line=>line.kind==='short').map(line=><circle cx="500" cy="-330" r={orbitRadius(line)} stroke-width={line.width} opacity={line.opacity} stroke-dasharray={line.dashes} stroke-dashoffset={line.offset}/>)}
     </g>
    </g>
    <path mask="url(#horizon-density-mask)" d={lines[8].path} fill="none" stroke="url(#horizon-hot)" stroke-width="19" opacity=".55" filter="url(#horizon-bloom)"/>
    <g mask="url(#horizon-density-mask)" fill="none" stroke="url(#horizon-hot)">{lines.filter(line=>line.kind==='core').map(line=><path d={line.path} stroke-width={line.width} opacity={line.opacity}/>)}</g>
    <g mask="url(#horizon-density-mask)" fill="none" stroke="url(#horizon-hot)" stroke-linecap="round">
     <g class="reading-horizon-spin">
      {[3,9,16,21].map(index=><circle cx="500" cy="-330" r={orbitRadius(lines[index])} stroke-width={lines[index].width+.5} opacity=".48" stroke-dasharray="46 180 12 282" stroke-dashoffset={index*79}/>)}
     </g>
    </g>
    <g mask="url(#horizon-right-light-mask)"><path d={lines[8].path} fill="none" stroke="url(#horizon-hot)" stroke-width="42" opacity=".7" filter="url(#horizon-bloom)"/></g>
    <path mask="url(#horizon-density-mask)" d={lines[10].path} fill="none" stroke="url(#horizon-hot)" stroke-width="2.4" opacity=".95"/>
    <path d="M170 326C315 364 700 350 900 248" fill="none" stroke="url(#horizon-gas)" stroke-width=".45" opacity=".18"/>
    </g>
    </g>
   </svg>
   <div class="reading-horizon-copy"><h1>视界</h1><p>万象于此交汇</p></div>
   </div>
  </div>
  <dl class="reading-horizon-census" aria-label="四类内容总量">
   {([{type:'article',label:'文章'},{type:'repo',label:'仓库'},{type:'share',label:'分享'},{type:'video',label:'视频'}] as const).map(item=><div class="reading-census-item" data-type={item.type}><dt>{item.label}</dt><dd data-reading-count={item.type} aria-label={`${item.label}总量正在读取`}>—</dd></div>)}
  </dl>
 </header>
}
