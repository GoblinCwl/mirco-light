export type ReadingBlock={title:string;opening:string}
export type ReadingCell={index:number;column:number;row:number;width:number;height:number;lines:number}
export type ReadingBand={indices:number[];tall?:number;left:number;tallLeft?:boolean;lines?:number;cells?:ReadingCell[]}
function units(text:string){return Array.from(text).reduce((sum,character)=>sum+(/[\u0000-\u007f]/.test(character)?.52:1),0)}
// Group adjacent, time-ordered items into complete rectangles. Long prose can occupy a spanning
// block; short neighbouring entries share the other column without empty cells.
export function readingBands(blocks:ReadingBlock[]):ReadingBand[]{
 // Complete tilings with staggered joins: their internal edges do not form repeated rows.
 const mosaics=[
  [[0,0,2,3],[2,0,4,1],[2,1,2,2],[4,1,2,1],[4,2,2,1]],
  [[0,0,4,1],[4,0,2,2],[0,1,2,2],[2,1,2,1],[2,2,4,1]],
  [[0,0,2,2],[2,0,4,1],[2,1,2,2],[4,1,2,2],[0,2,2,1],[0,3,6,1]],
  [[0,0,3,1],[3,0,3,2],[0,1,3,2],[3,2,3,1],[0,3,4,1],[4,3,2,1]],
 ]
 let previous=-1
 const result:ReadingBand[]=[],weight=(index:number)=>70+units(blocks[index].title)*1.6+units(blocks[index].opening)
 for(let i=0;i<blocks.length;){
  if(blocks.length-i>=5){
   let hash=2166136261
   for(const char of blocks[i].title+blocks[i].opening.slice(0,80))hash=Math.imul(hash^char.charCodeAt(0),16777619)
   let choice=(hash>>>0)%mosaics.length
   if(choice===previous)choice=(choice+1)%mosaics.length
   if(mosaics[choice].length>blocks.length-i)choice=choice%2
   previous=choice
   const shape=mosaics[choice],indices=shape.map((_,offset)=>i+offset)
   // Give long excerpts the narrow spanning cells; keep DOM and keyboard order chronological.
   const ranked=indices.slice().sort((a,b)=>weight(b)-weight(a))
   const slots=shape.map((cell,slot)=>({cell,slot})).sort((a,b)=>(b.cell[3]/b.cell[2])-(a.cell[3]/a.cell[2]))
   const cells:ReadingCell[]=slots.map(({cell},rank)=>{
    const [x,y,width,height]=cell,index=ranked[rank]
    return {index,column:x+1,row:y+1,width,height,lines:Math.max(3,Math.min(18,Math.ceil(units(blocks[index].opening)/Math.max(14,width*9))))}
   })
   result.push({indices,left:50,cells});i+=shape.length;continue
  }
  let stacked=false
  for(const count of [4,3]){
   if(i+count>blocks.length)continue
   const indices=Array.from({length:count},(_,offset)=>i+offset),ranked=indices.slice().sort((a,b)=>weight(b)-weight(a)),long=ranked[0],short=ranked.slice(1).reduce((sum,index)=>sum+weight(index),0)
   const enough=units(blocks[long].opening)>=(count===4?240:150)
   if(enough&&weight(long)>=short*(count===4?.55:.36)){
    const tallLeft=(result.length+long)%2===0,width=Math.max(24,Math.min(34,Math.round(30-(weight(long)/short-.6)*7)))
    const adjacentHeight=ranked.slice(1).reduce((sum,index)=>sum+148+Math.max(1,Math.ceil(units(blocks[index].title)/26))*32+Math.min(4,Math.max(1,Math.ceil(units(blocks[index].opening)/36)))*30,0)
    const lines=Math.max(5,Math.min(28,Math.round((adjacentHeight-148-Math.max(1,Math.ceil(units(blocks[long].title)/14))*32)/30)))
    result.push({indices,tall:long,tallLeft,lines,left:tallLeft?width:100-width});i+=count;stacked=true;break
   }
  }
  if(stacked)continue
  const indices=i+1<blocks.length?[i,i+1]:[i]
  const left=indices.length===1?100:Math.max(32,Math.min(68,Math.round(weight(i)/(weight(i)+weight(i+1))*100)))
  result.push({indices,left});i+=indices.length
 }
 return result
}
