const windowLength = 60000
// A gap of several polling intervals starts a fresh visual observation session.
export const observationGap = 10000
export function observationTimeline<T extends {time:number}>(points:T[],first:number|undefined,previousEnd:number,now=Date.now()) {
 let begin=0
 for(let i=points.length-1;i>0;i--)if(points[i].time-points[i-1].time>observationGap){begin=i;break}
 const history=points.slice(begin),end=history.at(-1)?.time??now
 const reset=!history.length||first===undefined||end<previousEnd||end-previousEnd>observationGap||begin>0&&history[0].time>previousEnd
 const origin=history.length?(reset?history[0].time:first):undefined
 let range=Math.min(windowLength,Math.max(1,end-(origin??end))),start=end-range
 if(history.length===1&&range<1000){start=end-500;range=1000}
 return {history,end,start,range,first:origin,reset}
}
