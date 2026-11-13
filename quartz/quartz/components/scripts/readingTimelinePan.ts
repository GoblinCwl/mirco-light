/** Map pointer travel to the full scroll range, with comfortable stops at both ends. */
export function readingTimelineTarget(y:number,height:number,maximum:number){
 if(height<=0||maximum<=0)return 0
 const inset=Math.min(40,height*.12)
 return Math.max(0,Math.min(1,(y-inset)/Math.max(1,height-2*inset)))*maximum
}
/** Keep fractional progress internally: browsers may round a subpixel scrollTop write to zero. */
export function readingTimelineStep(current:number,target:number,elapsed:number){
 return current+(target-current)*(1-Math.exp(-Math.max(8,Math.min(64,elapsed))/180))
}

/** Critically damped motion keeps velocity continuous when the pointer changes direction. */
export function readingTimelineMotion(position:number,velocity:number,target:number,elapsed:number){
 const dt=Math.max(0,Math.min(64,elapsed))/1000,frequency=12
 const offset=position-target,travel=velocity+frequency*offset,decay=Math.exp(-frequency*dt)
 return {position:target+(offset+travel*dt)*decay,velocity:(velocity-frequency*travel*dt)*decay}
}
