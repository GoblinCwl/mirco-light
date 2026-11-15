const {chromium}=require('/app/node_modules/playwright');const fs=require('fs');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
if(process.env.WEBGL==='1') await context.route('**/postscript.js',async route=>{const response=await route.fetch();const body=(await response.text()).replaceAll('preference:"webgpu"','preference:"webgl"');await route.fulfill({response,body})});
await context.route('**/api/visitors/visit',route=>route.fulfill({status:200,contentType:'application/json',body:'{"isNew":false}'}));
await context.addInitScript(()=>{
 const native=requestAnimationFrame.bind(window),cache=new WeakMap();window.__graphPerf=[];
 window.requestAnimationFrame=fn=>{let graph=cache.get(fn);if(graph===undefined){graph=fn.toString().includes('.renderer.render(');cache.set(fn,graph)}return native(t=>{const start=performance.now();fn(t);if(graph)window.__graphPerf.push(performance.now()-start)})};
 window.__frameTimes=[];let previous;const track=t=>{if(previous!==undefined)window.__frameTimes.push(t-previous);previous=t;native(track)};native(track);
});
await context.addInitScript(()=>{window.__canvasContexts=[];const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...rest){window.__canvasContexts.push(type);return original.call(this,type,...rest)}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('https://goblincwl.site/',{waitUntil:'domcontentloaded'});
await page.locator('.graph-container[data-graph-ready] canvas').first().waitFor({timeout:60000});await page.waitForTimeout(4000);
if(process.env.LAYER==='1') await page.addStyleTag({content:'.home-visitor-sky {contain:layout style}.home-visitor-sky > svg {will-change:transform}'});
if(process.env.FREEZE==='1') await page.evaluate(()=>{const blocked=new WeakSet(document.querySelectorAll('.visitor-comet,.visitor-comet *'));const original=Element.prototype.setAttribute;Element.prototype.setAttribute=function(...args){if(!blocked.has(this))return original.apply(this,args)}});
const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
const measure=async(name)=>{
 await page.evaluate(()=>{window.__graphPerf=[];window.__frameTimes=[]});
 await cdp.send('Profiler.enable');await cdp.send('Profiler.start');const before=(await cdp.send('Performance.getMetrics')).metrics;
 await page.waitForTimeout(8000);
 const profile=(await cdp.send('Profiler.stop')).profile;fs.writeFileSync('/work/'+name+'-cpu.json',JSON.stringify(profile));
 const after=(await cdp.send('Performance.getMetrics')).metrics;
 const metrics=await page.evaluate(()=>{const stats=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return {n:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1),over33:a.filter(x=>x>33.4).length}};return{frame:stats(window.__frameTimes),render:stats(window.__graphPerf)}});
 const b=Object.fromEntries(before.map(m=>[m.name,m.value])),a=Object.fromEntries(after.map(m=>[m.name,m.value]));metrics.cpuSeconds=a.TaskDuration-b.TaskDuration;metrics.heapMB=a.JSHeapUsedSize/1048576;
 await page.screenshot({path:'/work/'+name+'.png'});console.log(name,JSON.stringify(metrics));return metrics;
};
const small=await measure(process.env.LABEL+'-small');
await page.locator('.global-graph-icon:visible').first().click();await page.locator('.global-graph-container canvas').first().waitFor({timeout:60000});await page.waitForTimeout(4000);
const large=await measure(process.env.LABEL+'-large');
console.log('contexts',JSON.stringify(await page.evaluate(()=>window.__canvasContexts)));console.log('errors',JSON.stringify(errors));fs.writeFileSync('/work/'+process.env.LABEL+'-metrics.json',JSON.stringify({small,large,errors},null,2));
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
