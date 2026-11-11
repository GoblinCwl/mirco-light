import { homeIcons } from "./icons"

// Every domain rotates around the same SVG center, including platform silhouettes.
export function domainConstellation(label:string){
 const point=(x:number,y:number,r=1.3)=>`<circle cx="${x}" cy="${y}" r="${r*2.4}" fill="currentColor" opacity=".1"/><circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`
 const star=(x:number,y:number,r=2.8)=>`<circle cx="${x}" cy="${y}" r="${r*2}" fill="currentColor" opacity=".09"/><path class="home-domain-primary" d="M${x} ${y-r} ${x+r*.28} ${y-r*.28} ${x+r} ${y} ${x+r*.28} ${y+r*.28} ${x} ${y+r} ${x-r*.28} ${y+r*.28} ${x-r} ${y} ${x-r*.28} ${y-r*.28}Z" fill="currentColor"/>`
 const line=(path:string)=>`<path d="${path}" fill="none" stroke="currentColor" stroke-width=".85" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`
 const shapes:Record<string,string>={
  Private:line('M10 12 17 9l8 6-3 10-9 2-3-15m7-3 1 9 7-3m-7 3-5 9m5-9 4 7')+star(18,18,3.3)+point(10,12)+point(17,9,1)+point(25,15)+point(22,25,1.5)+point(13,27,1),
  Memo:line('M8 23c-3-10 9-19 18-13 8 6 0 17-8 16-6-1-7-8-2-10 4-2 8 3 5 6')+star(16,16,3)+point(8,23,1.7)+point(13,9,1)+point(26,10,1.4)+point(28,21,1.1)+point(18,26,1.6)+point(21,22,.8),
  Study:line('m7 26 11-18 11 18H7Zm0 0 11-8 11 8M18 8v10')+star(18,8,2.6)+star(18,18,3)+point(7,26,1.5)+point(29,26,1.5)+point(12,18,1)+point(24,18,1),
  Share:line('M8 14 14 10l8 16 6-4M8 14l20 8M14 10l14 12M8 14l14 12')+star(12,16,3.2)+star(24,20,3.2)+point(14,10,1)+point(8,14,1)+point(22,26,1)+point(28,22,1),
  Repo:`<circle cx="18" cy="18" r="12" fill="currentColor" opacity=".08"/>${homeIcons.github.replace('<svg viewBox="0 0 24 24"', '<svg x="6" y="6" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"')}<path d="M6 16v8m0-4h4" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>${point(6,16,.9)}${point(10,20,.9)}`,
  Video:`<path d="m12 6 4 5m8-5-4 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="6.5" y="11" width="23" height="17" rx="4" fill="currentColor" opacity=".1"/><rect x="6.5" y="11" width="23" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m13 17-1 4m11-4 1 4m-9 2 3 1 3-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>${star(29,9,2.3)}`,
 }
 const fallback=line('m7 21 7-12 11 3 4 13-15 3-7-7m7-12 4 10 7-7m-7 7-4 9')+star(18,19,3.5)+point(7,21,1.3)+point(14,9,1.5)+point(25,12,1.3)+point(29,25,1.4)+point(14,28,1)
 const dust='<g class="home-domain-drift"><ellipse cx="18" cy="18" rx="15" ry="11.5" transform="rotate(-28 18 18)" fill="none" stroke="currentColor" stroke-width=".65" opacity=".2"/><circle cx="31" cy="10" r=".85" fill="currentColor" opacity=".65"/><circle cx="5" cy="25" r=".65" fill="currentColor" opacity=".5"/></g>'
 return `<svg class="home-directory-stars" viewBox="0 0 36 36" aria-hidden="true">${dust}<g class="home-domain-constellation${label === 'Repo' || label === 'Video' ? ' home-domain-platform' : ''}">${shapes[label]||fallback}</g></svg>`
}
