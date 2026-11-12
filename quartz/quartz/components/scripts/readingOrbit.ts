/** Project the four beacons onto the SVG disk's tilted ellipse (1000 × 360). */
export function readingOrbit(index:number,seconds:number){
 const angle=seconds/180*Math.PI*2+index*Math.PI/2+Math.PI/4,tilt=-11*Math.PI/180
 const x=Math.cos(angle)*355,y=Math.sin(angle)*42
 return {x:(x*Math.cos(tilt)-y*Math.sin(tilt))/1000,y:(x*Math.sin(tilt)+y*Math.cos(tilt))/360,front:Math.sin(angle)>=0,scale:.97+Math.sin(angle)*.03}
}
