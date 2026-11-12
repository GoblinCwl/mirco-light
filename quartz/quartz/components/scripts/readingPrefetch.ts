/** Keep exactly one prepared page; reserving it does not advance the displayed page. */
export function createReadingPrefetch<T>(prepare:(page:number)=>Promise<T>){
 let nextPage=1,pending:Promise<T>|null=null
 const reserve=()=>{
  if(!pending)pending=prepare(nextPage).catch(error=>{pending=null;throw error})
  return pending
 }
 return {
  reserve,
  async take(){const value=await reserve();pending=null;nextPage++;return value},
 }
}
