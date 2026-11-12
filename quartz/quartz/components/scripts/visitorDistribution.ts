export type VisitorRegion = {region:string;count:number}
// The histogram covers historical visitors; the paginated list covers seven days.
// Derive both numerator and denominator from the same histogram response.
export function visitorDistribution(regions:VisitorRegion[],limit=6) {
 const valid=regions.filter(item=>Number.isFinite(item.count)&&item.count>0)
 const total=valid.reduce((sum,item)=>sum+item.count,0)
 const visible=valid.slice(0,limit).map(item=>({...item}))
 const rest=valid.slice(limit).reduce((sum,item)=>sum+item.count,0)
 if(rest)visible.push({region:'其他',count:rest})
 return visible.map(item=>({...item,percent:total?item.count/total*100:0}))
}
