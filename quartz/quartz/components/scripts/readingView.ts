export type ReadingItem={id:string;type:'article'|'repo'|'share'|'video';title:string;href:string;excerpt:string;tags:string[];encrypted:boolean;excerptTruncated?:boolean;updatedAt:string|null;createdAt:string|null}
// Indexed text can contain Markdown, but the reading excerpt is always plain text.
export function readingOpening(value:string){
 return value.replace(/^---\s*\n[\s\S]*?\n---\s*\n/,'').replace(/```[\s\S]*?(?:```|$)/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'').replace(/^\s{0,3}#{1,6}\s+/gm,'').replace(/^\s*>\s?/gm,'').replace(/[*_`~]/g,'').replace(/\s+/g,' ').trim()
}
export function readingDestination(href:string){
 try{const target=new URL(href,'https://reading.invalid');if(target.origin!=='https://reading.invalid'||!href.startsWith('/')||href.startsWith('//')||href.includes('\\'))return '#';return target.pathname+target.search+target.hash}catch{return '#'}
}

export function readingFolder(href:string){
 const destination=readingDestination(href)
 if(destination==='#')return null
 const path=new URL(destination,'https://reading.invalid').pathname
 const segments=path.split('/').filter(Boolean).slice(0,-1)
 try{return {label:segments.length?segments.map(segment=>decodeURIComponent(segment)).join(' / '):'首页',href:segments.length?'/'+segments.join('/')+'/':'/'}}catch{return null}
}

export function readingGridSpan(height:number,row:number,gap:number){return Math.max(1,Math.ceil((height+gap)/(row+gap)))}

// Reading has a larger bounded preview so tall cards can consume their available space.
export function readingPreview(value:string,truncated?:boolean){
 const text=readingOpening(value)
 return text&&(truncated===true||Array.from(value).length>=2400)&&!/(?:…|\.{3})$/.test(text)?text+'…':text
}

export function readingFillLineCount(available:number,lineHeight:number){
 return Number.isFinite(available)&&Number.isFinite(lineHeight)&&lineHeight>0?Math.max(1,Math.floor((available+.25)/lineHeight)):0
}
