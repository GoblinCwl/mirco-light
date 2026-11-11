export type Stats=Record<string,any>
export type Point={time:number;stats:Stats}
export type Host={id:string;name:string;status:string;updated:number;info:Stats;current:Stats;history:Point[]}
export type Series={label:string;read:(stats:Stats)=>number|undefined;unit?:string}
export type Metric={id:string;title:string;unit:string;series:Series[];max?:number;dimension?:'day'|'month'}
export function formatMetric(n:number|undefined,unit=''):string{
 if(n===undefined||!Number.isFinite(n))return '—'
 if(unit==='B'||unit==='B/s'){const suffix=unit==='B/s'?'/s':'',abs=Math.abs(n),power=abs?Math.min(4,Math.max(0,Math.floor(Math.log(abs)/Math.log(1024)))):0;return `${(n/1024**power).toLocaleString('zh-CN',{maximumFractionDigits:power?2:0})} ${['B','KiB','MiB','GiB','TiB'][power]}${suffix}`}
 return `${n.toLocaleString('zh-CN',{maximumFractionDigits:unit==='RPM'?0:2})}${unit==='%'||unit==='°C'?unit:unit?' '+unit:''}`
}
