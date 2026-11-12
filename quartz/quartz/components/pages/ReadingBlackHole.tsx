/** Restrained light around a dark horizon; the front disk crosses the shadow. */
export default function ReadingBlackHole(){
 return <div class="reading-horizon">
  <svg class="reading-horizon-art" viewBox="0 0 1000 360" role="img" aria-label="视界：深空中的黑洞与吸积盘">
   <defs>
    <radialGradient id="reading-horizon-aura"><stop stop-color="var(--horizon-rim)" stop-opacity=".1"/><stop offset=".55" stop-color="var(--horizon-cool)" stop-opacity=".025"/><stop offset="1" stop-color="var(--horizon-cool)" stop-opacity="0"/></radialGradient>
    <linearGradient id="reading-horizon-disk"><stop stop-color="var(--horizon-disk)" stop-opacity="0"/><stop offset=".2" stop-color="var(--horizon-disk)" stop-opacity=".2"/><stop offset=".46" stop-color="var(--horizon-rim)" stop-opacity=".85"/><stop offset=".61" stop-color="var(--horizon-rim)" stop-opacity=".65"/><stop offset=".85" stop-color="var(--horizon-disk)" stop-opacity=".15"/><stop offset="1" stop-color="var(--horizon-disk)" stop-opacity="0"/></linearGradient>
    <radialGradient id="reading-horizon-plasma"><stop offset=".08" stop-color="var(--horizon-rim)" stop-opacity="0"/><stop offset=".34" stop-color="var(--horizon-rim)" stop-opacity=".5"/><stop offset=".57" stop-color="var(--horizon-disk)" stop-opacity=".3"/><stop offset=".84" stop-color="var(--horizon-disk)" stop-opacity=".07"/><stop offset="1" stop-color="var(--horizon-disk)" stop-opacity="0"/></radialGradient>
    <filter id="reading-horizon-bloom" x="-30%" y="-150%" width="160%" height="400%"><feGaussianBlur stdDeviation="4"/></filter>
   </defs>
   <ellipse class="reading-horizon-aura" cx="500" cy="180" rx="420" ry="145" fill="url(#reading-horizon-aura)"/>
   <g fill="var(--horizon-cool)" opacity=".3">
    {[[183,91,.8],[289,277,.7],[735,72,.8],[842,253,.7],[655,35,.6],[429,315,.7]].map(([cx,cy,r])=><circle cx={cx} cy={cy} r={r}/>)}
   </g>
   <g transform="rotate(-11 500 180)" fill="none">
    <ellipse cx="500" cy="180" rx="380" ry="49" fill="url(#reading-horizon-plasma)"/>
    <ellipse cx="500" cy="180" rx="280" ry="32" stroke="url(#reading-horizon-disk)" stroke-width="10" opacity=".25" filter="url(#reading-horizon-bloom)"/>
    <ellipse cx="500" cy="180" rx="324" ry="37" stroke="url(#reading-horizon-disk)" stroke-width=".65" opacity=".35"/>
    <path d="M404 180C404 55 596 55 596 180" stroke="url(#reading-horizon-disk)" stroke-width="7" opacity=".55" filter="url(#reading-horizon-bloom)"/>
    <path d="M407 180C407 64 593 64 593 180H589C589 70 411 70 411 180Z" fill="url(#reading-horizon-disk)" opacity=".75"/>
    <circle cx="500" cy="180" r="81" stroke="var(--horizon-rim)" stroke-width="5" opacity=".2" filter="url(#reading-horizon-bloom)"/>
    <circle cx="500" cy="180" r="78" fill="var(--horizon-core)"/>
    <circle cx="500" cy="180" r="79" stroke="var(--horizon-rim)" stroke-width=".8" opacity=".65"/>
    <path d="M145 180C250 229 750 229 855 180C740 213 260 213 145 180Z" fill="url(#reading-horizon-disk)" opacity=".4" filter="url(#reading-horizon-bloom)"/>
    <path d="M145 180C250 229 750 229 855 180C740 213 260 213 145 180Z" fill="url(#reading-horizon-disk)" opacity=".7"/>
    <path d="M170 183C325 222 675 222 830 183" stroke="url(#reading-horizon-disk)" stroke-width=".8" opacity=".65"/>
    <path class="reading-horizon-stream" d="M170 183C325 222 675 222 830 183" pathLength="100" stroke="var(--horizon-rim)" stroke-width="1.1" stroke-dasharray="6 94" opacity=".35"/>
   </g>
  </svg>
  <div class="reading-horizon-beacons" aria-label="四类内容总量">
   {([{type:'article',label:'文章'},{type:'repo',label:'仓库'},{type:'share',label:'分享'},{type:'video',label:'视频'}] as const).map(item=><div class="reading-horizon-beacon" data-type={item.type}>
    <span class="reading-beacon-pin" aria-hidden="true"/>
    <div class="reading-beacon-data"><strong data-reading-count={item.type} aria-label={`${item.label}总量正在读取`}>—</strong><span class="reading-beacon-label">{item.label}</span></div>
   </div>)}
  </div>
 </div>
}
