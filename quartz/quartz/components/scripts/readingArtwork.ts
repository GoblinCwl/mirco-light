// Background compositions are drawn for large, quiet surfaces, not enlarged UI icons.
const frame=(body:string)=>`<svg viewBox="0 0 320 240" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const filmHoles=Array.from({length:23},(_,index)=>{const x=-20+index*16;return `<rect x="${x}" y="52" width="7" height="7" rx="1"/><rect x="${x}" y="177" width="7" height="7" rx="1"/>`}).join('')
export const readingArtwork={
 article:frame('<path d="M47 57c39-14 73-8 111 15 38-23 72-29 111-15v137c-39-14-73-8-111 15-38-23-72-29-111-15V57Z"/><path d="M158 72v137M39 66l-11 5v137c48-14 85-6 130 14 45-20 82-28 130-14V71l-11-5" opacity=".55"/><path d="M66 84c25-4 47 2 71 14M66 103c25-4 47 2 71 14M66 122c25-4 47 2 71 14M66 141c25-4 47 2 55 6M179 98c24-12 46-18 71-14M179 117c24-12 46-18 71-14M179 136c24-12 46-18 71-14M179 155c24-12 46-18 54-16" opacity=".65"/><path d="M225 43v-29l10 8 10-8v23" opacity=".45"/>'),
 repo:frame('<rect x="30" y="30" width="260" height="180"/><path d="M30 56h260M44 43h2m9 0h2m9 0h2M49 73v117" opacity=".45"/><path d="m113 91-29 28 29 28m95-56 29 28-29 28M173 80l-26 78" stroke-width="2"/><path d="M67 175h72m13 0h44m12 0h42M67 188h34m13 0h82" opacity=".35"/><path d="M15 64H9v118h6m290-118h6v118h-6" opacity=".35"/>'),
 share:frame('<path d="M72 22h55l18 18v112H72V22Z" fill="var(--light)"/><path d="M127 22v18h18M85 58h46M85 72h46M85 86h31"/><path d="M157 38h48l18 18v105h-66V38Z" fill="var(--light)"/><path d="M205 38v18h18M169 75h40m-40 14h40m-40 14h24"/><path d="M48 94V67h64l22 18h138v112H48V94Z" fill="var(--light)"/><path d="M30 101h260l-18 109H48L30 101Z" fill="var(--light)" stroke-width="1.4"/><path d="M56 196h202M70 121h53" opacity=".5"/>'),
 video:frame('<g transform="rotate(-12 160 120)"><rect x="-30" y="42" width="380" height="152"/><path d="M-30 68h380M-30 168h380" opacity=".6"/>'+filmHoles+'<rect x="-16" y="77" width="100" height="82"/><rect x="96" y="77" width="100" height="82"/><rect x="208" y="77" width="100" height="82"/><path d="m137 99 30 19-30 19V99Z" opacity=".65"/></g>'),
}

export const readingZipper='<svg viewBox="0 0 14 100" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="translate(-1 0)"><path d="M7 0C7 5 2 5 2 11v16l4 8M7 0c0 5 5 5 5 11v16l-4 8M7 46v54"/><path d="M0 5h3m-3 7h3m-3 7h3m8-10h3m-3 7h3m-3 7h3M4 55h6m-6 6h6m-6 6h6m-6 6h6m-6 6h6m-6 6h6m-6 6h6" stroke-width="2"/><rect x="3" y="32" width="8" height="12" rx="2" fill="var(--light)"/><path d="M7 40v6"/><rect x="4" y="45" width="6" height="11" rx="1.5" fill="var(--light)"/><path d="M7 48v5"/></g></svg>'

export function readingArtworkLayout(width:number,height:number,type:string){
 const ratio=width/Math.max(height,1)
 if(ratio<.82){
  const artWidth=type==='video'?Math.min(height*.82,width*1.8):Math.min(width*1.24,height*.84)
  return {width:Math.round(artWidth),right:Math.round(-artWidth*.15),bottom:Math.round(height*.12),angle:type==='video'?90:-6}
 }
 if(ratio>1.5){
  const artWidth=Math.min(width*.92,height*1.85)
  return {width:Math.round(artWidth),right:Math.round(-artWidth*.07),bottom:Math.round(-height*.22),angle:type==='video'?0:7}
 }
 const artWidth=Math.min(width*.98,height*1.35)
 return {width:Math.round(artWidth),right:Math.round(-artWidth*.09),bottom:Math.round(-height*.09),angle:type==='video'?0:-4}
}

const corner=(body:string,viewBox='0 0 24 24')=>`<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
export const readingCornerMarks={
 article:corner('<path d="M21 2C15 1 8 5 6 11c-1 3-.6 5 1 7 5-.5 10-4 12-9l-5 2 6-5c.4-1.3.8-2.7 1-4Z" fill="currentColor" fill-opacity=".14"/><path d="M3 22C7 17 9 10 17 5M8 15c-.7-1.3-.7-3 0-5m3 2c1.5.2 3-.1 4.5-.8"/>'),
 repo:corner('<path d="M5 7v10m14-10v2c0 5-10 1-14 6"/><circle cx="5" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>'),
 share:corner('<path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2M7 11l-2 2a5 5 0 0 0 7 7l2-2"/>'),
 video:corner('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 7 6 4-6 4V7Z" fill="currentColor" stroke="none"/><path d="M6 17h12" opacity=".65"/>'),
}
