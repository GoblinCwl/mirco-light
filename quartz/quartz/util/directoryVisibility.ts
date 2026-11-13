import {minimatch} from 'minimatch'
/** Files and every ancestor directory may match; this never changes the source index. */
export function isDirectoryListed(path:string,patterns:readonly string[]=[]):boolean {
 const relative=path.replace(/^\/+|\/+$/g,'')
 const candidates=[relative,relative.replace(/\.md$/,'')]
 const parts=relative.split('/')
 for(let i=1;i<parts.length;i++)candidates.push(parts.slice(0,i).join('/'))
 return !patterns.some(pattern=>candidates.some(candidate=>minimatch(candidate,pattern,{dot:true})))
}
