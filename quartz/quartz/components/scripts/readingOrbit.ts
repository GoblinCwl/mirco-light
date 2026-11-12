/** Project the four beacons onto the SVG disk's tilted ellipse (1000 × 360). */
export function readingOrbit(index:number,seconds:number){
 const angle=seconds/180*Math.PI*2+index*Math.PI/2+Math.PI/4,tilt=-11*Math.PI/180
 const x=Math.cos(angle)*355,y=Math.sin(angle)*42
 return {x:(x*Math.cos(tilt)-y*Math.sin(tilt))/1000,y:(x*Math.sin(tilt)+y*Math.cos(tilt))/360,front:Math.sin(angle)>=0,scale:.97+Math.sin(angle)*.03}
}

/** A slow elastic pull; the marker stays on its orbit and never falls into the horizon. */
export function readingTether(index:number,seconds:number,width:number,height:number){
 const position=readingOrbit(index,seconds)
 const strength=(1-Math.cos(seconds/28*Math.PI*2+index*Math.PI*.7))/2
 return {angle:Math.atan2(-position.y*height,-position.x*width),strength,stretch:1+strength*.65,length:26+strength*12,bend:3+strength*4}
}
