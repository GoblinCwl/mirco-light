import {serviceIcon} from '../../util/serviceIcons'
import {navigationIcon} from './navigationIcon'
import {readSiteSession} from './siteSession'
import {readArticleIndex} from './contentCatalog'
import {setupStellarLogin} from './stellarLogin'
import { showSiteDialog, closeSiteDialog } from './siteDialog'
import { showPasswordToast } from './passwordFeedback'
import { setupDockedButton } from './dockedButton'
import { setupObservatoryLayout } from './observatoryLayout'
import { formatMetric, type Host, type Metric, type Point } from './observatoryMetrics'
import { simplifySlug, type FullSlug } from '../../util/path'
type Snapshot={range:string;generatedAt:number;authenticated:boolean;systems:Host[]}
const svgNS='http://www.w3.org/2000/svg'
const palette=['var(--secondary)','#79a6ad','#b69e6c','#9e91b5','#8ca286','#bd858d','#738bad','#b7957d']
const trendColors:Record<string,string[]>={
 resources:['blue','violet','orange'],
 network:['cyan','orange'],
 load:['green','blue','pink'],
 temperature:['coral','gold','violet','pink','cyan','green'],
 disk:['gold','blue','pink'],
 visitors:['cyan'],
}
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;return node}
const selectedSeries=new Map<string,string>()
const chartUpdates=new WeakMap<HTMLElement,(metric:Metric,history:Point[],current:Record<string,any>)=>void>()
const pathAnimations=new WeakMap<SVGPathElement,number>()
function animateMetric(label:HTMLElement,value:number|undefined,unit:string){
 const text=formatMetric(value,unit),before=label.dataset.metricText||''
 if(before===text)return
 label.dataset.metricText=text;label.setAttribute('aria-label',text)
 const numeric=text.match(/^([\d.,-]+)(.*)$/),previous=before.match(/^([\d.,-]+)(.*)$/)
 const roll=Boolean(previous&&numeric&&previous[2]===numeric[2]&&label.isConnected&&!matchMedia('(prefers-reduced-motion:reduce)').matches)
 label.replaceChildren();label.classList.add('observatory-counter')
 if(!numeric){label.append(element('span',text));return}
 const digits=element('span','','observatory-counter-digits');digits.setAttribute('aria-hidden','true')
 for(const[index,char]of [...numeric[1]].entries()){
  const old=previous?.[1][previous[1].length-numeric[1].length+index]
  const cell=element('span','','observatory-counter-cell');cell.classList.toggle('is-digit',/\d/.test(char))
  if(roll&&old&&old!==char&&/\d/.test(old)&&/\d/.test(char)){
   const reel=element('span','','observatory-counter-reel');reel.append(element('span',old),element('span',char));cell.append(reel)
   const animation=reel.animate([{transform:'translateY(0)'},{transform:'translateY(-50%)'}],{duration:680,easing:'cubic-bezier(.22,.7,.25,1)',fill:'forwards'})
   void animation.finished.then(()=>{if(reel.isConnected)cell.replaceChildren(document.createTextNode(char))}).catch(()=>{})
  }else cell.textContent=char
  digits.append(cell)
 }
 const suffix=element('span',numeric[2],'observatory-counter-unit');suffix.setAttribute('aria-hidden','true');label.append(digits,suffix)
}
// A live sample advances time; existing samples retain their heights.
function animatePath(path:SVGPathElement,next:string,offset=0,scale=1){
 const frame=pathAnimations.get(path);if(frame)cancelAnimationFrame(frame)
 pathAnimations.delete(path)
 if((!offset&&scale===1)||!path.isConnected||matchMedia('(prefers-reduced-motion:reduce)').matches){path.setAttribute('d',next);return}
 const start=performance.now()
 const tick=(time:number)=>{
  if(!path.isConnected)return
  // Constant-speed movement avoids a quick shove followed by a long stop.
  const progress=Math.min(1,(time-start)/680),shift=offset*(1-progress),stretch=1+(scale-1)*(1-progress)
  path.setAttribute('d',progress===1?next:next.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g,(_,command,x,y)=>command+(Number(x)*stretch+shift).toFixed(2)+' '+y))
  if(progress<1)pathAnimations.set(path,requestAnimationFrame(tick));else pathAnimations.delete(path)
 }
 tick(start)
}
function seriesColor(metric:Metric,index:number){
 const key=metric.id==='temperature'?({处理器:'blue',内存:'violet',显卡:'orange',SSD:'coral',无线网卡:'cyan',硬盘:'green'} as Record<string,string>)[metric.series[index].label]:undefined
 const colors=trendColors[metric.id]
 return key?`var(--observatory-line-${key})`:colors?`var(--observatory-line-${colors[index%colors.length]})`:palette[index%palette.length]
}
function chart(metric:Metric,history:Point[],current:Record<string,any>){
 const card=element('section','','observatory-chart'),heading=element('header'),name=element('h3',metric.title),latest=element('strong'),plot=element('div','','observatory-plot'),legend=element('div','','observatory-legend'),ticks=element('div','','observatory-time-axis')
 const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 600 140');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label',metric.title+'历史趋势')
 const path=(tag:string,attrs:Record<string,string>)=>{const node=document.createElementNS(svgNS,tag);for(const[key,v]of Object.entries(attrs))node.setAttribute(key,v);svg.append(node);return node}
 for(let i=0;i<4;i++)path('line',{x1:'0',x2:'600',y1:String(10+i*40),y2:String(10+i*40),class:'observatory-gridline'})
 const cursor=path('line',{x1:'0',x2:'0',y1:'0',y2:'140',class:'observatory-chart-cursor'});cursor.style.display='none'
 const tooltip=element('div','','observatory-tooltip'),empty=element('span','等待观测数据','observatory-no-history');tooltip.hidden=true
 heading.append(name,latest);plot.append(svg,empty,tooltip);card.append(heading,plot,ticks,legend)
 const filled=['resources','network','disk','visitors','cpu','memory','memory-percent'].includes(metric.id)
 const diskScale=metric.id==='disk'?element('div','','observatory-chart-scale'):undefined
 if(diskScale)card.insertBefore(diskScale,plot)
 const shapes=new Map<string,{line:SVGPathElement;area?:SVGPathElement;dot:SVGElement;button:HTMLButtonElement}>()
 const areaObservers:MutationObserver[]=[]
 let drawingSamples:Point[]=[]
 let hoverFraction:number|undefined
 let start=0,end=1,timeRange=1,scaleMin=0,scaleMax=0,firstLiveSample:number|undefined
 const paint=()=>{
  const selected=selectedSeries.get(metric.id),active=metric.series.findIndex(series=>series.label===selected)
  metric.series.forEach((series,index)=>{
   const shape=shapes.get(series.label);if(!shape)return
   const muted=active>=0&&index!==active
   for(const node of [shape.line,shape.area,shape.dot,shape.button].filter((node):node is SVGElement|HTMLButtonElement=>!!node))node.classList.toggle('is-muted',muted)
   shape.button.setAttribute('aria-pressed',String(active===index))
  })
  const index=Math.max(0,active);animateMetric(latest,metric.series[index]?.read(current),metric.series[index]?.unit??metric.unit);latest.style.color=metric.series.length?seriesColor(metric,index):''
 }
 const choose=(label:string)=>{if(selectedSeries.get(metric.id)===label)selectedSeries.delete(metric.id);else selectedSeries.set(metric.id,label);paint()}
 const update=(nextMetric:Metric,nextHistory:Point[],nextCurrent:Record<string,any>)=>{
  const previousHistory=history,previousEnd=end,previousStart=start,previousRange=timeRange
  metric=nextMetric;history=nextHistory;current=nextCurrent
  name.textContent=metric.title
  // Fit the samples collected so far, then keep a rolling one-minute window.
  end=history.at(-1)?.time||Date.now()
  if(history.length&&(firstLiveSample===undefined||end-previousEnd>60000))firstLiveSample=history[0].time
  timeRange=Math.min(60000,Math.max(1,end-(firstLiveSample??end)));start=end-timeRange
  if(history.length===1&&timeRange<1000){start=end-500;timeRange=1000}
  if(metric.dimension){start=history[0]?.time||end;timeRange=Math.max(86400000,end-start);if(history.length===1){start=end-43200000;end+=43200000}}
  const live=!metric.dimension&&shapes.size>0&&previousHistory.length>0&&history.length>0&&end>=previousEnd&&end-previousEnd<=60000
  const animate=live&&previousHistory.length>1
  const shift=animate?(start-previousStart)/previousRange*600:0,stretch=animate?timeRange/previousRange:1
  const samples=live?[...new Map([...drawingSamples,...history].map(point=>[point.time,point])).values()].sort((a,b)=>a.time-b.time):history
  // Keep the point just outside the left edge to draw the segment crossing
  // that edge, including throughout the slide from the previous viewport.
  const cutoff=live?Math.min(start,previousStart):start
  const firstVisible=samples.findIndex(point=>point.time>=cutoff)
  const drawingHistory=samples.slice(Math.max(0,firstVisible-1))
  const firstRetained=drawingHistory.findIndex(point=>point.time>=start)
  drawingSamples=drawingHistory.slice(Math.max(0,firstRetained-1))
  const values=metric.series.filter(series=>metric.id!=='disk'||series.unit!=='%').flatMap(series=>drawingHistory.map(point=>series.read(point.stats)).filter((n):n is number=>typeof n==='number'&&Number.isFinite(n)))
  let observedMin=Math.min(0,...values),observedMax=Math.max(metric.max||0,...values,1)
  if(metric.id==='temperature'&&values.length){
   // Compare devices on one shared, readable scale rather than compressing
   // every temperature against zero. Round bounds and retain them during live
   // updates so small fluctuations do not move the whole chart vertically.
   observedMin=Math.floor((Math.min(...values)-2)/5)*5
   observedMax=Math.max(observedMin+10,Math.ceil((Math.max(...values)+2)/5)*5)
  }
  scaleMin=live?Math.min(scaleMin,observedMin):observedMin
  scaleMax=live?Math.max(scaleMax,observedMax):observedMax
  const min=scaleMin
  const span=scaleMax-min||1
  if(diskScale)diskScale.replaceChildren(element('span','使用率 0–100%'),element('span',`读写 0–${formatMetric(scaleMax,'B/s')}`))
  for(const[label,shape]of shapes)if(!metric.series.some(series=>series.label===label)){shape.line.remove();shape.area?.remove();shape.dot.remove();shape.button.remove();shapes.delete(label)}
  metric.series.forEach((series,index)=>{
   let shape=shapes.get(series.label)
   if(!shape){
    const line=path('path',{fill:'none','stroke-width':'2.2','vector-effect':'non-scaling-stroke',class:'observatory-series'}) as SVGPathElement,dot=path('circle',{r:'3',class:'observatory-series'}),button=element('button');button.type='button';button.title='突出 '+series.label+'，再次点击恢复全部';button.append(element('i'),document.createTextNode(series.label))
    for(const item of [line,dot,button])item.addEventListener('click',()=>choose(series.label))
    let area:SVGPathElement|undefined
    if(filled){area=path('path',{class:'observatory-area'}) as SVGPathElement;svg.insertBefore(area,line);const fill=()=>{const d=line.getAttribute('d')||'';area!.setAttribute('d',d.split(/(?=M)/).filter(Boolean).map(segment=>{const points=[...segment.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)];return points.length?segment+`L${points.at(-1)![1]} 130L${points[0][1]} 130Z`:''}).join(''))};const observer=new MutationObserver(fill);observer.observe(line,{attributes:true,attributeFilter:['d']});areaObservers.push(observer)}
    legend.append(button);shape={line,area,dot,button};shapes.set(series.label,shape)
   }
   const color=seriesColor(metric,index);shape.line.setAttribute('stroke',color);shape.area?.setAttribute('fill',color);shape.dot.setAttribute('fill',color);(shape.button.firstElementChild as HTMLElement).style.background=color
   const seriesMin=metric.id==='disk'&&series.unit==='%'?0:min,seriesSpan=metric.id==='disk'&&series.unit==='%'?100:span
   let d=''
   for(const point of drawingHistory){const value=series.read(point.stats);if(value===undefined||!Number.isFinite(value)){d+=' ';continue}const x=(point.time-start)/timeRange*600,y=130-(value-seriesMin)/seriesSpan*120;d+=(d&&!d.endsWith(' ')?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)}
   animatePath(shape.line,d.trim(),shift,stretch);shape.dot.style.display='none'
   if(history.length===1){const value=series.read(history[0].stats);if(value!==undefined){shape.dot.setAttribute('cx',String((history[0].time-start)/timeRange*600));shape.dot.setAttribute('cy',String(130-(value-seriesMin)/seriesSpan*120));shape.dot.style.display=''}}
  })
  empty.hidden=!!history.length
  const tickLabel=(time:number)=>metric.dimension==='month'?new Date(time).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}):metric.dimension==='day'||timeRange>=86400000?new Date(time).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'}):new Date(time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',...(timeRange<=120000?{second:'2-digit'} as const:{})})
  const tickCount=metric.dimension?Math.min(2,history.length):Math.min(history.length,Math.max(2,Math.min(5,Math.floor((plot.clientWidth||320)/80))))
  const tickTimes=Array.from({length:tickCount},(_,i)=>tickCount===1?history[0].time:metric.dimension?history[i===0?0:history.length-1].time:history[Math.round(i*(history.length-1)/(tickCount-1))].time)
  ticks.style.justifyContent=tickCount===1?'center':''
  ticks.replaceChildren(...tickTimes.map(time=>element('span',tickLabel(time))));tooltip.hidden=true;cursor.style.display='none';paint()
  if(hoverFraction!==undefined)inspectFraction(hoverFraction)
 }
 const inspectFraction=(fraction:number)=>{
  const samples=drawingSamples.filter(point=>point.time>=start&&point.time<=end)
  if(!samples.length)return
  const target=start+fraction*timeRange
  let index=0;for(let i=1;i<samples.length;i++)if(Math.abs(samples[i].time-target)<Math.abs(samples[index].time-target))index=i
  const point=samples[index],x=(point.time-start)/timeRange*600
  svg.append(cursor)
  cursor.setAttribute('x1',String(x));cursor.setAttribute('x2',String(x));cursor.style.display='block';tooltip.hidden=false
  tooltip.replaceChildren(element('time',metric.dimension?String(point.stats.period):new Date(point.time).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})))
  metric.series.forEach((series,index)=>{
   const row=element('span'),marker=element('i');marker.style.background=seriesColor(metric,index);marker.setAttribute('aria-hidden','true')
   row.append(marker,document.createTextNode(`${series.label}  ${formatMetric(series.read(point.stats),series.unit??metric.unit)}`));tooltip.append(row)
  })
  tooltip.style.left=fraction>.55?'auto':'8px';tooltip.style.right=fraction>.55?'8px':'auto'
 }
 const inspect=(event:PointerEvent)=>{
  const bounds=plot.getBoundingClientRect();if(bounds.width<=0)return
  hoverFraction=Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width));inspectFraction(hoverFraction)
 }
 plot.addEventListener('pointermove',inspect);plot.addEventListener('pointerdown',inspect);plot.addEventListener('pointerleave',()=>{hoverFraction=undefined;tooltip.hidden=true;cursor.style.display='none'})
 window.addCleanup(()=>{areaObservers.forEach(observer=>observer.disconnect());for(const shape of shapes.values()){const frame=pathAnimations.get(shape.line);if(frame)cancelAnimationFrame(frame)}})
 update(metric,history,current);chartUpdates.set(card,update);return card
}
const clock=(seconds:number)=>{if(!Number.isFinite(seconds))return '—';seconds=Math.max(0,Math.floor(seconds));const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);return `${days?days+' 天 ':''}${hours} 小时 ${minutes} 分`}
const visitorMetrics:Metric[]=[
 {id:'resources',title:'资源使用',unit:'%',max:100,series:[{label:'CPU',read:s=>s.cpu},{label:'内存',read:s=>s.mp},{label:'GPU',read:s=>s.gpu}]},
 {id:'network',title:'网络流量',unit:'B/s',series:[{label:'上传',read:s=>s.b?.[0]??(typeof s.ns==='number'?s.ns*2**20:undefined)},{label:'下载',read:s=>s.b?.[1]??(typeof s.nr==='number'?s.nr*2**20:undefined)}]},
 {id:'disk',title:'磁盘使用',unit:'B/s',series:[{label:'使用率',unit:'%',read:s=>s.dp},{label:'读取',read:s=>s.dio?.[0]??undefined},{label:'写入',read:s=>s.dio?.[1]??undefined}]},
 {id:'temperature',title:'主机温度',unit:'°C',series:[{label:'温度',read:s=>s.temperature}]},
 {id:'load',title:'系统负载',unit:'',series:[{label:'1 分钟',read:s=>s.la?.[0]??undefined},{label:'5 分钟',read:s=>s.la?.[1]??undefined},{label:'15 分钟',read:s=>s.la?.[2]??undefined}]},
]
document.addEventListener('nav',()=>{
 const root=document.querySelector<HTMLElement>('[data-observatory]');if(!root)return
 const lifecycle=new AbortController(),signal=lifecycle.signal
 const get=<T extends HTMLElement=HTMLElement>(key:string)=>document.querySelector<T>(`[data-observatory-${key}]`)!
 const content=get('content'),status=get('status')
 const fitLayout=setupObservatoryLayout(root,signal)
 const auth=get<HTMLDialogElement>('auth'),manage=get<HTMLDialogElement>('manage')
 const identityKey='quartz-observatory-identity:v1'
 let rememberedUntil=0,identityChecked=false
 try{rememberedUntil=Number(JSON.parse(localStorage.getItem(identityKey)||'null')?.expires)||0}catch{}
 const loginError=(message:string)=>{
  showPasswordToast(message,true)
  const toast=document.querySelector('.decrypt-toast');if(toast)auth.append(toast)
 }
 const releaseToast=()=>{for(const dialog of [auth,manage]){const toast=dialog.querySelector('.decrypt-toast');if(toast){toast.classList.remove('visible');document.body.append(toast)}}}
 const login=()=>{
  if(auth.open)return
  showSiteDialog(auth);get('auth-open')?.setAttribute('aria-expanded','true')
  prepareLogin()
 }
 let data:Snapshot|undefined,authenticated=false,observationStartedAt:number|undefined,identityRevision=0
 let visitorData:{dimension:'day'|'month';points:{period:string;count:number}[];total:number}|undefined,visitorError=false,visitorTimer:ReturnType<typeof setTimeout>|undefined
 const drawVisitorTrend=()=>{
  const plots=content.querySelector<HTMLElement>('.observatory-charts');if(!plots||!content.hasAttribute('data-observatory-live'))return
  const dimension=visitorData?.dimension||'day',history:Point[]=(visitorData?.points||[]).map(point=>({time:Date.parse(point.period+(dimension==='month'?'-01':'')+'T00:00:00+08:00'),stats:{count:point.count,period:point.period}}))
  const metric:Metric={id:'visitors',title:'访问人数',unit:'人',dimension,series:[{label:dimension==='month'?'月访客':'日访客',read:s=>s.count}]}
  const description=visitorData?`按${dimension==='month'?'月':'日'}去重统计${dimension==='day'?' · 历史不足 30 天':''}`:'正在读取彗星来访数据'
  let card=plots.querySelector<HTMLElement>('[data-metric="visitors"]')
  const key=JSON.stringify([visitorData,visitorError])
  if(card?.dataset.visitorSignature===key)return
  const aggregate={count:visitorData?.total}
  if(card)chartUpdates.get(card)?.(metric,history,aggregate)
  else{card=chart(metric,history,aggregate);card.dataset.metric='visitors';card.insertBefore(element('p','','observatory-chart-description'),card.querySelector('.observatory-plot'));plots.append(card)}
  card.dataset.visitorSignature=key;card.querySelector('.observatory-chart-description')!.textContent=description
  card.querySelector('.observatory-plot')!.classList.toggle('observatory-skeleton',!visitorData&&!visitorError)
  const empty=card.querySelector<HTMLElement>('.observatory-no-history')!;if(!visitorData){empty.textContent=visitorError?'访客统计暂不可用':'正在读取访客统计…'}else empty.textContent='暂无来访记录'
 }
 let uptimeAnchor:{value:number;at:number}|undefined
 const liveUptime=()=>{const host=data?.systems.find(host=>host.name==='Cwl-Server');if(!host)return;const value=host.info.u;if(!uptimeAnchor||uptimeAnchor.value!==value)uptimeAnchor={value,at:performance.now()};const label=content.querySelector<HTMLElement>('[data-live-uptime]');if(label)label.textContent=clock(value+(host.status==='up'?(performance.now()-uptimeAnchor.at)/1000:0))}
 const uptimeTimer=setInterval(liveUptime,10000)
 let poll:ReturnType<typeof setTimeout>|undefined,request:AbortController|undefined
 const api=async(path:string,init:RequestInit={})=>{
  const response=await fetch('/api/site'+path,{...init,credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000),...(init.signal?[init.signal]:[])]),headers:{'Content-Type':'application/json'}})
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'读取失败'),{status:response.status});return result
 }
 let servicesTimer:ReturnType<typeof setTimeout>|undefined,servicesLoading=false,journalLoading=false,visitorLoading=false
 type JournalEvent={id:number;kind:'content'|'site'|'service';completedAt:string;payload:{titles?:string[];articles?:{title:string;slug?:string;href?:string;type?:string}[];count?:number;service?:string}}
 let journalTimer:ReturnType<typeof setTimeout>|undefined,journalSignature=''
 const relativeTime=(stamp:string)=>{
  const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(stamp))/1000))
  if(seconds<60)return '刚刚'
  if(seconds<3600)return `${Math.floor(seconds/60)} 分钟前`
  if(seconds<86400)return `${Math.floor(seconds/3600)} 小时前`
  return `${Math.floor(seconds/86400)} 天前`
 }
 const loadJournal=async()=>{
  if(signal.aborted||document.hidden||journalLoading)return
  const target=get('journal');if(!target)return
  clearTimeout(journalTimer);journalLoading=true
  try{
   const result:{events:JournalEvent[]}=await api('/observatory/journal');if(signal.aborted)return
   // Older records contain titles only; resolve them against the published article index.
   const legacyIndex=result.events.some(event=>event.kind==='content'&&!event.payload.articles)?await readArticleIndex().catch(()=>null):null
   if(signal.aborted)return
   const key=JSON.stringify(result.events)
   if(journalSignature!==key){
    journalSignature=key;target.replaceChildren();target.classList.remove('is-loading');target.removeAttribute('aria-label');target.setAttribute('aria-busy','false')
    if(!result.events.length)target.append(element('p','将从下一次更新开始记录。','observatory-journal-empty'))
    else{
     const list=element('ol')
     for(const event of result.events){
      const item=element('li'),head=element('div','','observatory-journal-heading'),label=element('strong',({content:'内容更新',site:'站点更新',service:'服务恢复'})[event.kind]),time=element('time')
      item.dataset.kind=event.kind
      const icon=element('span','','observatory-journal-icon'),svg=document.createElementNS(svgNS,'svg'),path=document.createElementNS(svgNS,'path'),copy=element('div','','observatory-journal-copy')
      icon.setAttribute('aria-hidden','true');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round')
      path.setAttribute('d',({content:'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6',site:'m8 6-6 6 6 6m8-12 6 6-6 6m-3-13-2 14',service:'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6'})[event.kind]);svg.append(path);icon.append(svg)
      time.dateTime=event.completedAt;time.textContent=relativeTime(event.completedAt);time.title=new Date(event.completedAt).toLocaleString('zh-CN')
      let text=''
      if(event.kind==='content'){const titles=event.payload.titles||[];text=titles.slice(0,2).map(title=>`《${title}》`).join('、')+(titles.length>2?`等 ${event.payload.count||titles.length} 项`:'')}
      else if(event.kind==='site')text=`调整了 ${event.payload.count||0} 个文件`
      else text=`${event.payload.service||'服务'} · 服务恢复正常`
      const detail=element('p',text)
      if(event.kind==='content'){
       const articles=event.payload.articles||(event.payload.titles||[]).map(title=>{
        const matches=Object.entries(legacyIndex||{}).filter(([,article])=>article.title===title)
        return {title,slug:matches.length===1?matches[0][0]:undefined,href:undefined}
       })
       detail.replaceChildren();detail.title=articles.map(article=>article.title).join('、')
       articles.slice(0,2).forEach((article,index)=>{
        if(index)detail.append('、')
        if(article.slug){const link=element('a',`《${article.title}》`);link.href=article.href||'/'+simplifySlug(article.slug as FullSlug).split('/').map(encodeURIComponent).join('/');link.className='internal';link.dataset.noPopover='true';detail.append(link)}
        else detail.append(`《${article.title}》`)
       })
       if(articles.length>2)detail.append(`等 ${event.payload.count||articles.length} 项`)
      }
      head.append(label,time);copy.append(head,detail);item.append(icon,copy);list.append(item)
     }
     target.append(list)
    }
   }else for(const time of target.querySelectorAll('time'))time.textContent=relativeTime(time.dateTime)
  }catch{if(!signal.aborted&&!journalSignature){target.classList.remove('is-loading');target.setAttribute('aria-busy','false');target.replaceChildren(element('p','运行纪事暂不可用','observatory-journal-empty'))}}
  finally{journalLoading=false;if(!signal.aborted&&!document.hidden)journalTimer=setTimeout(()=>void loadJournal(),30000)}
 }
 const loadVisitorTrend=async()=>{
  if(signal.aborted||document.hidden||visitorLoading)return
  clearTimeout(visitorTimer);visitorLoading=true
  try{const result=await api('/observatory/visitors');if(signal.aborted)return;visitorData=result;visitorError=false}
  catch{if(!signal.aborted)visitorError=true}
  finally{visitorLoading=false;if(!signal.aborted){drawVisitorTrend();if(!document.hidden)visitorTimer=setTimeout(()=>void loadVisitorTrend(),60000)}}
 }
 const loadServices=async()=>{
  if(signal.aborted||document.hidden||servicesLoading)return
  clearTimeout(servicesTimer);servicesLoading=true
  const list=get('services'),labels:Record<string,string>={running:'运行中',reachable:'可连接',error:'异常',offline:'不可用',unknown:'待更新'}
  try{
   const result=await api('/observatory/services');if(signal.aborted)return
   const existing=new Map([...list.children].map(row=>[(row as HTMLElement).dataset.service,row as HTMLElement])),rows:HTMLElement[]=[]
   for(const service of result.services as {id:string;name:string;icon:string;state:string;source?:string}[]){
    let row=existing.get(service.id)
    if(!row){row=element('div');row.dataset.service=service.id;const title=element('dt'),icon=element('span','','observatory-service-icon'),name=element('span'),state=element('dd');icon.innerHTML=service.icon.trim().startsWith('<')?navigationIcon(service.icon):serviceIcon(service.icon);title.append(icon,name);state.append(element('i'),element('span'));row.append(title,state)}
    const icon=row.querySelector<HTMLElement>('.observatory-service-icon');if(icon&&icon.dataset.kind!==service.icon){icon.innerHTML=service.icon.trim().startsWith('<')?navigationIcon(service.icon):serviceIcon(service.icon);icon.dataset.kind=service.icon}
    row.querySelector('dt>span:last-child')!.textContent=service.name
    const state=row.querySelector('dd')!;state.dataset.state=service.state;state.title=service.source==='direct'?'服务直连检测':'Beszel 运行状态';state.querySelector('span')!.textContent=labels[service.state]||'待更新';rows.push(row)
   }
   if(!rows.length){const empty=element('div','暂无启用的服务','observatory-services-pending');rows.push(empty)}
   list.replaceChildren(...rows);list.setAttribute('aria-busy','false')
  }catch{if(!signal.aborted){if(!list.querySelector('dd'))list.replaceChildren(element('div','服务状态暂不可用','observatory-services-pending'));list.setAttribute('aria-busy','false');for(const state of list.querySelectorAll<HTMLElement>('dd')){state.dataset.state='unknown';state.querySelector('span')!.textContent='暂不可用'}}}
  finally{servicesLoading=false;if(!signal.aborted&&!document.hidden)servicesTimer=setTimeout(()=>void loadServices(),30000)}
 }
 const identity=()=>{
  const displayed=authenticated||!identityChecked&&rememberedUntil>Date.now()
  root.classList.toggle('is-admin',displayed)
  const trigger=get<HTMLButtonElement>('auth-open')
  if(trigger){
   trigger.setAttribute('aria-label',authenticated?'打开星枢管理':'管理员登录')
   trigger.setAttribute('aria-controls',authenticated?'observatory-manage-dialog':'observatory-auth-dialog')
   trigger.setAttribute('aria-expanded',String(authenticated?manage.open:auth.open))
  }
  if(authenticated&&auth.open)auth.close()
 }

 const resolveIdentity=(loggedIn:boolean)=>{
  const changed=!identityChecked||authenticated!==loggedIn
  authenticated=loggedIn;identityChecked=true
  try{
   if(loggedIn){if(rememberedUntil<=Date.now())rememberedUntil=Date.now()+43200000;localStorage.setItem(identityKey,JSON.stringify({expires:rememberedUntil}))}
   else{rememberedUntil=0;localStorage.removeItem(identityKey)}
  }catch{}
  identity()
  if(changed)document.dispatchEvent(new CustomEvent('stellar-session-resolved',{detail:{authenticated:loggedIn}}))
 }

 const hero=(host:Host)=>{
  const header=element('section','','observatory-hero'),lead=element('div','','observatory-hero-lead'),mark=element('button','','observatory-emblem')
  mark.type='button';mark.dataset.observatoryAuthOpen='';mark.setAttribute('aria-label','管理员登录');mark.setAttribute('aria-haspopup','dialog');mark.setAttribute('aria-controls','observatory-auth-dialog');mark.setAttribute('aria-expanded',String(auth.open));mark.innerHTML=`<svg viewBox="0 0 64 64" fill="none">
    <circle class="observatory-energy" cx="32" cy="32" r="13" fill="currentColor"/>
    <g class="observatory-frame"><path d="m32 8 6 18 18 6-18 6-6 18-6-18-18-6 18-6Z" stroke="currentColor" stroke-width="1.2" opacity=".5"/><path class="observatory-flow" d="m32 8 6 18 18 6-18 6-6 18-6-18-18-6 18-6Z" pathLength="100" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="14 86"/></g>
    <path class="observatory-core" d="m32 20 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="currentColor"/>
    <g class="observatory-signal"><path d="m51 12 1.4 3.6L56 17l-3.6 1.4L51 22l-1.4-3.6L46 17l3.6-1.4Z" fill="currentColor"/></g>
    <g class="observatory-satellite"><circle cx="12" cy="45" r="2" fill="currentColor"/><circle cx="12" cy="45" r="4" stroke="currentColor" stroke-width=".75" opacity=".35"/></g>
  </svg>`
  const text=element('div','','observatory-host-heading'),eyebrow=element('div','','observatory-eyebrow'),state=element('span',host.status==='up'?'运行中':host.status==='down'?'离线':host.status==='paused'?'暂停观测':'等待连接','observatory-state')
  state.classList.toggle('is-up',host.status==='up');eyebrow.append(element('span','微光集 · 运行状态'),state)
  text.append(eyebrow,element('h2','Cwl-Server'),element('p','这里记录微光集背后的服务器状态。'));lead.append(mark,text)
  const uptime=element('div','','observatory-uptime');uptime.append(element('span',host.status==='up'?'连续运行':'上次记录运行时长'),element('strong',clock(host.info.u)));uptime.querySelector('strong')!.setAttribute('data-live-uptime','')
  header.append(lead,uptime);return header
 }
 const summary=(host:Host)=>{
  const wrap=element('div','','observatory-summary')
  for(const [label,key,unit,code]of [['CPU 使用率','cpu','%','CPU'],['内存使用率','mp','%','RAM'],['磁盘使用率','dp','%','DISK'],['主机温度','temperature','°C','TEMP']]){
   const card=element('section','','observatory-kpi'),heading=element('div'),value=host.current[key]
   card.dataset.metric=key;heading.append(element('span',label),element('small',code));const valueLabel=element('strong');animateMetric(valueLabel,value,unit);card.append(heading,valueLabel)
   // Temperature uses a 0–100 °C display scale; percentages already use 0–100.
   const track=element('div','','observatory-meter'),fill=element('i')
   fill.style.width=`${Math.max(0,Math.min(100,Number.isFinite(value)?value:0))}%`
   track.setAttribute('aria-hidden','true');track.append(fill);card.append(track)
   wrap.append(card)
  }
  return wrap
 }
 const render=()=>{
  if(!data)return
  const host=data.systems.find(host=>host.name==='Cwl-Server')
  if(!host){content.removeAttribute('data-observatory-live');content.replaceChildren(element('p','暂未找到 Cwl-Server 的观测数据','observatory-empty'));return}
  let plots=content.querySelector<HTMLElement>('.observatory-charts')
  if(!content.hasAttribute('data-observatory-live')){
   const section=element('section','','observatory-trends');section.setAttribute('aria-label','性能趋势')
   plots=element('div','','observatory-charts');section.append(plots)
   content.replaceChildren(hero(host),summary(host),section);content.setAttribute('data-observatory-live','')
  }else{
   const state=content.querySelector<HTMLElement>('.observatory-state')!;state.textContent=host.status==='up'?'运行中':host.status==='down'?'离线':host.status==='paused'?'暂停观测':'等待连接';state.classList.toggle('is-up',host.status==='up')
   content.querySelector('.observatory-uptime > span')!.textContent=host.status==='up'?'连续运行':'上次记录运行时长'
   for(const card of content.querySelectorAll<HTMLElement>('.observatory-kpi')){
    const value=host.current[card.dataset.metric!],unit=card.dataset.metric==='temperature'?'°C':'%'
    animateMetric(card.querySelector('strong')!,value,unit)
    card.querySelector<HTMLElement>('.observatory-meter > i')!.style.width=`${Math.max(0,Math.min(100,Number.isFinite(value)?value:0))}%`
   }
  }
  const descriptions=['CPU、内存与 GPU 的使用变化','每秒上传与下载的数据量','使用率（左刻度）与读写速率（右刻度）','处理器、显卡、SSD、内存及无线网卡温度','最近 1、5、15 分钟的平均系统负载']
  const temperatureNames:Record<string,string>={cpu:'处理器',gpu:'显卡',ssd:'SSD',memory:'内存',wifi:'无线网卡',disk:'硬盘'}
  const temperatureSeries=Object.entries(temperatureNames).filter(([key])=>[host.current,...host.history.map(point=>point.stats)].some(stats=>typeof stats.temperatures?.[key]==='number')).map(([key,label])=>({label,read:(stats:Record<string,any>)=>stats.temperatures?.[key]}))
  visitorMetrics.map(metric=>metric.id==='temperature'&&temperatureSeries.length?{...metric,series:temperatureSeries}:metric.id==='resources'?{...metric,series:metric.series.filter(series=>series.label!=='GPU'||[host.current,...host.history.map(point=>point.stats)].some(stats=>typeof stats.gpu==='number'))}:metric).forEach((metric,index)=>{
   const existing=plots!.querySelector<HTMLElement>(`[data-metric="${metric.id}"]`)
   if(existing){chartUpdates.get(existing)?.(metric,host.history,host.current);return}
   const card=chart(metric,host.history,host.current);card.dataset.metric=metric.id;card.insertBefore(element('p',descriptions[index],'observatory-chart-description'),card.querySelector('.observatory-chart-scale,.observatory-plot'));plots!.append(card)
  })
  drawVisitorTrend()
  identity()
  fitLayout()
  liveUptime()
 }
 const load=async()=>{
  if(signal.aborted||document.hidden||request&&!request.signal.aborted)return
  clearTimeout(poll);const own=request=new AbortController(),revision=identityRevision
  try{
    const next:Snapshot=await api('/observatory?range=1m',{signal:own.signal});if(signal.aborted||own.signal.aborted)return
    observationStartedAt??=next.generatedAt
    for(const host of next.systems)host.history=host.history.filter(point=>point.time>=observationStartedAt!)
    data=next;if(revision===identityRevision)resolveIdentity(next.authenticated);render()
   status.textContent='';status.hidden=true;status.classList.remove('is-error')
  }catch{if(!signal.aborted&&!own.signal.aborted){
   status.textContent='星枢数据暂不可用，请稍后重试';status.hidden=false;status.classList.add('is-error')
   // A monitoring failure must not prevent opening administrator controls.
   if(!identityChecked)try{const session=await readSiteSession();if(!signal.aborted&&!own.signal.aborted&&revision===identityRevision)resolveIdentity(session.authenticated)}catch{if(!signal.aborted&&!own.signal.aborted&&revision===identityRevision)resolveIdentity(false)}
  }}
  finally{
   if(request===own)request=undefined
   if(!signal.aborted&&!own.signal.aborted&&!document.hidden)poll=setTimeout(()=>void load(),2000)
  }
 }
 const compact=matchMedia('(max-width:1199px)'),launch=document.querySelector<HTMLButtonElement>('[data-observatory-tools-open]'),toolsPanel=document.querySelector<HTMLDialogElement>('[data-observatory-tools-panel]')
 const adaptTools=()=>{
  if(!toolsPanel)return
  if(toolsPanel.open)toolsPanel.close()
  if(!compact.matches)toolsPanel.setAttribute('open','')
 }
 if(launch&&toolsPanel){
  setupDockedButton(launch,compact,signal,()=>"quartz-operation-launch-position:v1")
  launch.onclick=()=>{if(!toolsPanel.open){showSiteDialog(toolsPanel);launch.setAttribute('aria-expanded','true')}}
  get('tools-close').onclick=()=>void closeSiteDialog(toolsPanel)
  toolsPanel.addEventListener('close',()=>{if(!toolsPanel.open)launch.setAttribute('aria-expanded','false')},{signal})
  toolsPanel.addEventListener('click',event=>{if(event.target!==toolsPanel||!compact.matches)return;const box=toolsPanel.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)void closeSiteDialog(toolsPanel)},{signal})
  compact.addEventListener('change',adaptTools,{signal});adaptTools()
 }
 const openManage=()=>{
  if(!authenticated){login();return}
  if(manage.open)return
  showSiteDialog(manage);identity()
 }
 get('manage-close').onclick=()=>void closeSiteDialog(manage)
 manage.addEventListener('click',event=>{if(event.target!==manage)return;const box=manage.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)void closeSiteDialog(manage)},{signal})
 manage.addEventListener('close',()=>{
  if(manage.open)return
  releaseToast();identity()
  const trigger=get<HTMLButtonElement>('auth-open');if(document.activeElement===trigger)trigger?.blur()
 },{signal})
 root.addEventListener('click',event=>{if((event.target as Element).closest('[data-observatory-auth-open]')){if(authenticated)openManage();else login()}},{signal})
 get('auth-close').onclick=()=>auth.close()
 auth.addEventListener('click',event=>{if(event.target!==auth)return;const box=auth.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)auth.close()},{signal})
 auth.addEventListener('close',()=>{
  releaseToast()
  const trigger=get<HTMLButtonElement>('auth-open');trigger?.setAttribute('aria-expanded','false')
  if(authenticated&&document.activeElement===trigger)trigger.blur()
 },{signal})
 const prepareLogin=setupStellarLogin(auth,signal,api,loginError)
 get<HTMLButtonElement>('logout').onclick=async()=>{const button=get<HTMLButtonElement>('logout');button.disabled=true;try{await api('/admin/logout',{method:'POST',body:'{}'});document.dispatchEvent(new CustomEvent('stellar-auth-changed',{detail:{authenticated:false}}));showPasswordToast('注销成功')}catch{if(!signal.aborted){showPasswordToast('退出登录失败，请重试',true);const toast=document.querySelector('.decrypt-toast');if(toast)manage.append(toast)}}finally{button.disabled=false}}
 document.addEventListener('stellar-auth-changed',event=>{
  identityRevision++
  resolveIdentity(!!(event as CustomEvent).detail.authenticated)
  if(!authenticated&&manage.open)void closeSiteDialog(manage)
 },{signal})
 document.addEventListener('visibilitychange',()=>{
  clearTimeout(poll);clearTimeout(servicesTimer);clearTimeout(journalTimer);clearTimeout(visitorTimer)
  if(document.hidden){request?.abort();return}
  void load();void loadServices();void loadJournal();void loadVisitorTrend()
 },{signal})
 window.addCleanup(()=>{releaseToast();clearTimeout(servicesTimer);clearTimeout(journalTimer);clearTimeout(visitorTimer);lifecycle.abort();if(auth.open)auth.close();if(manage.open)manage.close();if(toolsPanel?.open)toolsPanel.close();request?.abort();clearTimeout(poll);clearInterval(uptimeTimer)})
 identity()
 // The monitoring response supplies the initial identity to both page scripts.
 document.addEventListener('services-config-changed',()=>void loadServices(),{signal})
 void loadServices();void loadJournal();void loadVisitorTrend();void load()
})
