export type ReadingRect={type:string;top:number;bottom:number;left:number;right:number}
// Only join matching types across a shared horizontal edge, including partial
// edges where a wide block meets multiple narrower blocks.
export function readingDividers(rects:ReadingRect[]){
 const edges=new Map<number,number[]>()
 rects.forEach((rect,index)=>{const key=Math.floor(rect.bottom);const items=edges.get(key)||[];items.push(index);edges.set(key,items)})
 const result:{index:number;left:number;width:number}[]=[]
 rects.forEach((rect,index)=>{
  if(!rect.type)return
  const intervals:{left:number;right:number}[]=[]
  const top=Math.floor(rect.top)
  for(let key=top-2;key<=top+2;key++)for(const otherIndex of edges.get(key)||[]){
   const other=rects[otherIndex];if(otherIndex===index||other.type!==rect.type||Math.abs(other.bottom-rect.top)>1.5)continue
   const left=Math.max(rect.left,other.left),right=Math.min(rect.right,other.right)
   if(right-left>2)intervals.push({left:left-rect.left,right:right-rect.left})
  }
  intervals.sort((a,b)=>a.left-b.left)
  const merged:typeof intervals=[]
  for(const segment of intervals){const last=merged.at(-1);if(last&&segment.left<=last.right+1)last.right=Math.max(last.right,segment.right);else merged.push({...segment})}
  for(const segment of merged)result.push({index,left:segment.left,width:segment.right-segment.left})
 })
 return result
}

export function readingDividerSegments(rects:ReadingRect[],origin:{top:number;left:number}){
 return readingDividers(rects).map(edge=>({left:rects[edge.index].left-origin.left+edge.left,top:rects[edge.index].top-origin.top,width:edge.width}))
}
