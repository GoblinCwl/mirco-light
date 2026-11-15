const {chromium}=require('/app/node_modules/playwright'),fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const meteors=Array.from({length:60},(_,i)=>({id:(i+1).toString(16).padStart(8,'0')+'0123456789abcdef',arrivedOn:`2026-11-${String(1+i%14).padStart(2,'0')}`,region:`地区${i}`}));
 const results=[];
 for(const theme of ['light','dark'])for(const mode of ['svg','canvas']) {
  const context=await browser.newContext({viewport:{width:1920,height:1080},colorScheme:theme});
  await context.route('**/api/visitors/visit',r=>r.fulfill({status:200,contentType:'application/json',body:'{"isNew":false}'}));
  await context.route(/\/api\/visitors\?/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({total:60,today:4,meteors,meteorId:meteors[20].id})}));
  if(mode==='svg')await context.route('**/postscript.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync('/work/svg-baseline.js','utf8')}));
  await context.addInitScript(()=>{const native=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>native(()=>fn(10000));performance.now=()=>10000});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://goblincwl.site/',{waitUntil:'domcontentloaded'});await page.locator('[data-home-visitors][data-loaded="true"]').waitFor({timeout:60000});
  await page.addStyleTag({content:'.visitor-own-ring{animation:none!important}'});await page.waitForTimeout(2000);
  const sky=page.locator('[data-visitor-sky]');await sky.screenshot({path:`/work/${mode}-${theme}.png`});
  results.push({theme,mode,errors,box:await sky.boundingBox(),nodes:await sky.locator('*').count(),cometOpacity:mode==='svg'?await sky.locator('.visitor-comet').first().evaluate(el=>({css:getComputedStyle(el).opacity,attribute:el.getAttribute('opacity')})):null});
  await context.close();
 }
 console.log(JSON.stringify(results));fs.writeFileSync('/work/visual.json',JSON.stringify(results,null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
