/** Calendar days in Beijing; launch day is day one. */
export function siteAgeDays(founded:string,now=Date.now()):number|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(founded))return null
 const start=Date.parse(founded+'T00:00:00Z')
 if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==founded)return null
 const today=Date.parse(new Date(now+8*3600000).toISOString().slice(0,10)+'T00:00:00Z')
 return start>today?null:Math.floor((today-start)/86400000)+1
}
