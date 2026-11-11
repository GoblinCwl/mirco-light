/** Persist only public versioned fonts in the top-level site's cache partition.
 * Media, permissions and private subtitle files never enter this cache. */
export async function readPlayerAsset(url:URL,signal:AbortSignal) {
 let cache:Cache|undefined
 if(url.pathname.startsWith('/static/vendor/')&&/\.(woff2?|ttf|otf)$/i.test(url.pathname)) {
  try {
   if(typeof caches!=='undefined') {
    cache=await caches.open('quartz-player-fonts-v1')
    const hit=await cache.match(url.href)
    if(hit){signal.throwIfAborted();return hit.arrayBuffer()}
   }
  } catch {cache=undefined}
 }
 signal.throwIfAborted()
 const response=await fetch(url,{cache:'force-cache',credentials:'omit',signal})
 if(!response.ok)throw new Error('预览资源读取失败')
 if(cache)try{await cache.put(url.href,response.clone())}catch{/* Storage limits never block playback. */}
 return response.arrayBuffer()
}
