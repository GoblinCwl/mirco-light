import {test} from 'node:test'
import assert from 'node:assert/strict'
import {graphPalette} from './graphPalette'

function luminance(hex:string){
 const rgb=hex.slice(1).match(/../g)!.map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4)
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
}
test('articles retain brand teal and all node types have distinct soft accents',()=>{
 assert.deepEqual(graphPalette.article,{light:'#84a59d',dark:'#84a59d'})
 for(const theme of ['light','dark'] as const){
  const colors=Object.values(graphPalette).map(p=>p[theme])
  assert.equal(new Set(colors).size,5)
  const background=luminance(theme==='light'?'#faf8f8':'#161618')
  // The existing brand teal is deliberately retained at the user's request.
  for(const [kind,palette] of Object.entries(graphPalette)){
   if(kind==='article')continue
   const color=palette[theme]
   const value=luminance(color),contrast=(Math.max(value,background)+.05)/(Math.min(value,background)+.05)
   assert.ok(contrast>=3,`${theme} ${color} node contrast: ${contrast}`)
  }
 }
})
