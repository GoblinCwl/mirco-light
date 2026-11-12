import {sharedState} from './sharedRequest'

type Mermaid = {initialize:(config:Record<string,unknown>)=>void;render:(id:string,source:string)=>Promise<{svg:string}>}
const state=sharedState('repo-mermaid:v1',()=>({module:undefined as Promise<{default:Mermaid}>|undefined,queue:Promise.resolve(),serial:0}))
export async function renderRepoMermaid(host:HTMLElement,signal:AbortSignal,sanitize:(svg:string)=>string){
 const blocks=[...host.querySelectorAll<HTMLElement>('pre > code.language-mermaid')].map(code=>({source:code.textContent||'',pre:code.parentElement!}))
 if(!blocks.length||signal.aborted)return
 const render=async()=>{
  if(signal.aborted)return
  const url=new URL('/static/vendor/mermaid/11.4.0/dist/mermaid.esm.min.mjs',location.origin).href
  state.module??=import(/* @vite-ignore */ url).catch(error=>{state.module=undefined;throw error})
  const mermaid=(await state.module).default
  for(const block of blocks){
   if(signal.aborted||!host.contains(block.pre))return
   try{
    if(block.source.length>50000)throw Error('diagram too large')
    const dark=document.documentElement.getAttribute('saved-theme')==='dark'
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:dark?'dark':'default',htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:50000,maxEdges:1000,suppressErrorRendering:true,secure:['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','suppressErrorRendering','themeCSS','htmlLabels','flowchart']})
    const {svg}=await mermaid.render(`repo-mermaid-${++state.serial}`,block.source)
    if(signal.aborted||!host.contains(block.pre))return
    block.pre.classList.add('repo-mermaid');block.pre.innerHTML=sanitize(svg);block.pre.setAttribute('aria-label','Mermaid 图表')
   }catch{
    if(signal.aborted)return
    block.pre.replaceChildren();block.pre.classList.remove('repo-mermaid')
    const code=document.createElement('code');code.textContent=block.source;block.pre.append(code)
    const notice=document.createElement('span');notice.className='repo-diagram-error';notice.textContent='图表未能渲染，已保留源代码';block.pre.append(notice)
   }
  }
 }
 const enqueue=()=>{const work=state.queue.then(render);state.queue=work.catch(()=>{});return work}
 try{await enqueue()}catch{/* Loading failure retains the original code blocks. */}
 document.addEventListener('themechange',()=>{void enqueue().catch(()=>{})},{signal})
}
