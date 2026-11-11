// Use the site's timezone for both static pages and browser-rendered API content.
export const SITE_DATE_TIME_ZONE='Asia/Shanghai'
const chineseDate=new Intl.DateTimeFormat('zh-CN',{timeZone:SITE_DATE_TIME_ZONE,year:'numeric',month:'numeric',day:'numeric'})
const chineseTime=new Intl.DateTimeFormat('zh-CN',{timeZone:SITE_DATE_TIME_ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
export function formatDateWithSeconds(date:Date,locale='zh-CN',includeSeconds=false):string{
 if(locale.includes('zh')){
  const parts=Object.fromEntries(chineseDate.formatToParts(date).map(part=>[part.type,part.value]))
  const label=`${parts.year}年${parts.month}月${parts.day}日`
  return includeSeconds?`${label} ${chineseTime.format(date)}`:label
 }
 return date.toLocaleString(locale,{timeZone:SITE_DATE_TIME_ZONE,year:'numeric',month:'long',day:'numeric',...(includeSeconds?{hour:'2-digit',minute:'2-digit',second:'2-digit'}:{})})
}
const directories=new Map<string,Intl.DateTimeFormat>()
export function formatDirectoryDate(date:Date,locale='zh-CN'):string{
 let format=directories.get(locale)
 if(!format){format=new Intl.DateTimeFormat(locale,{timeZone:SITE_DATE_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});directories.set(locale,format)}
 return format.format(date)
}
