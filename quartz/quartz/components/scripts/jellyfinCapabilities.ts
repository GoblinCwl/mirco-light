import {driveApiUrl} from './openlistShared'
import {subtitleBurnInForBrowser} from './jellyfinSubtitlePolicy'
type DeviceProfile = Record<string, any>
let generator:Promise<any>|undefined
const rates = new Map<string,{value:number;at:number}>()
let hlsSupport:Promise<any>|undefined
async function hlsClient() {
  const url=new URL('/static/vendor/jellyfin-web/10.11.11/htmlHlsSupport.js?v=quartz2',location.href)
  hlsSupport ||= import(/* @vite-ignore */ url.href).catch(error=>{hlsSupport=undefined;throw error})
  return hlsSupport
}
export async function jellyfinHlsMode(duration:number,videoCodec?:string):Promise<'mse'|'native'> {
  const upstream=await hlsClient()
  return upstream.enableHlsJsPlayerForCodecs({RunTimeTicks:duration*10000000,MediaStreams:[{Codec:videoCodec}]},'Video')?'mse':'native'
}
export async function jellyfinHlsBuffer():Promise<6|30> {
  return (await hlsClient()).highBitrateBuffer
}

export async function jellyfinSubtitleBurnIn(preferred='auto'):Promise<string> {
  const url=new URL('/static/vendor/jellyfin-web/10.11.11/browser.js',location.href)
  const upstream=await import(/* @vite-ignore */ url.href)
  return subtitleBurnInForBrowser(preferred,upstream.default)
}

export async function jellyfinDeviceProfile(renderPgs=false,burnIn='auto'):Promise<DeviceProfile> {
  generator ||= (async()=>{
    const url=new URL('/static/vendor/jellyfin-web/10.11.11/browserDeviceProfile.js',location.href)
    const upstream=await import(/* @vite-ignore */ url.href)
    const settingsURL=new URL('profileSettings.js',url)
    const settings=await import(/* @vite-ignore */ settingsURL.href)
    return {generate:upstream.default,settings}
  })().catch(error=>{generator=undefined;throw error})
  const upstream=await generator
  upstream.settings.setSubtitlePreferences({renderPgs,burnIn})
  return upstream.generate({enableHls:true,enableSsaRender:true,enablePgsRender:renderPgs})
}

export async function jellyfinAutoBitrate(match:string,signal:AbortSignal):Promise<number> {
  signal.throwIfAborted()
  const identity=new URL(driveApiUrl('public/quartz/jellyfin/bitrate-test')).origin,cached=rates.get(identity)
  if(cached&&Date.now()-cached.at<60000)return cached.value
  let measured=0
  // Jellyfin API client's probe sizes, thresholds and 70% safety margin.
  for(const [bytes,threshold]of [[500000,500000],[1000000,20000000],[3000000,50000000]]){
    try{
      const response=await fetch(driveApiUrl(`public/quartz/jellyfin/bitrate-test/${encodeURIComponent(match)}/${bytes}`),{credentials:'omit',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])})
      if(!response.ok)break
      const started=performance.now(),data=await response.arrayBuffer()
      // Jellyfin writes complete buffer blocks, so the response may be slightly
      // larger than Size. Its own client measures the actual received bytes.
      if(data.byteLength<bytes||data.byteLength>bytes+1048576)break
      measured=Math.round(data.byteLength*8/Math.max(.001,(performance.now()-started)/1000))
      if(measured<threshold)break
    }catch(error){if(signal.aborted)throw error;break}
  }
  if(measured>0){const value=Math.min(120000000,Math.max(64000,Math.round(measured*.7)));rates.set(identity,{value,at:Date.now()});try{localStorage.setItem('quartz-jellyfin-bitrate:v1',JSON.stringify({origin:identity,value}))}catch{}return value}
  try{const saved=JSON.parse(localStorage.getItem('quartz-jellyfin-bitrate:v1')||'null');if(saved?.origin===identity&&Number.isFinite(saved.value)&&saved.value>=64000&&saved.value<=120000000)return saved.value}catch{}
  return 1500000
}
