import {SITE_DATE_TIME_ZONE} from '../../util/formatDate'
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:SITE_DATE_TIME_ZONE,year:'numeric',month:'2-digit'})
export function readingMonth(value?:string|null){
 if(!value)return null
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return null
 const parts=formatter.formatToParts(date),year=parts.find(part=>part.type==='year')!.value,month=parts.find(part=>part.type==='month')!.value
 return `${year}-${month}`
}
export function readingYears(months:Iterable<string>){
 const years=new Map<string,string[]>()
 for(const month of [...new Set(months)].filter(value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value)).sort().reverse()){
  const year=month.slice(0,4);const list=years.get(year)||[];list.push(month);years.set(year,list)
 }
 return [...years].map(([year,months])=>({year,months}))
}
