import {repoEscape as e} from './repoShared'
const colors:Record<string,string>={Python:'#3572a5',TypeScript:'#3178c6',JavaScript:'#c7ae32',Java:'#b07219',Go:'#00add8',Rust:'#dea584','C#':'#9567b8','C++':'#f34b7d',C:'#666c87',HTML:'#e34c26',CSS:'#8e65b5',Vue:'#41b883',Shell:'#78a64b',Kotlin:'#a97bff',Swift:'#ef8056',SCSS:'#c6538c'}
export function repoLanguageChart(raw:Record<string,number>){
 const entries=Object.entries(raw).filter(([,bytes])=>Number.isFinite(bytes)&&bytes>0).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
 const total=entries.reduce((sum,[,bytes])=>sum+bytes,0)
 if(!total)return '<p class="repo-language-caption">暂无语言统计</p>'
 const segments=entries.map(([name,bytes])=>({name,percent:bytes/total*100,color:colors[name]||'#8796a8'}))
 return `<div class="repo-language-bar" role="img" aria-label="默认分支语言占比">${segments.map(item=>`<span style="width:${item.percent}%;background:${item.color}" title="${e(item.name)} ${item.percent.toFixed(1)}%"></span>`).join('')}</div><ul class="repo-language-legend">${segments.map(item=>`<li><i style="background:${item.color}" aria-hidden="true"></i><span>${e(item.name)}</span><strong>${item.percent.toFixed(1)}%</strong></li>`).join('')}</ul>`
}
