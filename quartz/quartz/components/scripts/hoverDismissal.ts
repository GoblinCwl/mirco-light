/** Bridge the gap between an anchor and its interactive preview. */
export function hoverDismissal(close:()=>void,containsPointer:()=>boolean,delay=350) {
 let timer:ReturnType<typeof setTimeout>|undefined
 const cancel=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined}
 const schedule=()=>{
  cancel()
  timer=setTimeout(()=>{timer=undefined;if(!containsPointer())close()},delay)
 }
 return {cancel,schedule}
}
