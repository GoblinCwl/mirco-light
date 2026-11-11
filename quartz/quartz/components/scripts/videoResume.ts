// Serialized into the isolated player. MSE may fetch a saved position before
// that position appears in seekable; native HLS still needs its decoded frame.
export function resumeSeekTarget(video: HTMLVideoElement, saved: number, nativeHls: boolean, playing: boolean, mseStartPosition=false): number | undefined {
  if(mseStartPosition && !playing)return
  if (!Number.isFinite(saved) || saved < 5 || video.seeking || !Number.isFinite(video.duration) || video.duration <= 0 || video.readyState < (nativeHls ? 2 : 1)) return
  const target = Math.min(saved, Math.max(0, video.duration - 1))
  if (nativeHls && (!playing || !Array.from({length:video.seekable.length}, (_,index)=>[video.seekable.start(index),video.seekable.end(index)]).some(([start,end])=>target>=start&&target<=end))) return
  return target
}
