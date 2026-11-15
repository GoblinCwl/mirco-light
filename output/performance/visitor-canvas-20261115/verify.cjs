const {chromium}=require('/app/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('fs');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const meteors=Array.from({length:60},(_,i)=>({id:(i+1).toString(16).padStart(8,'0')+'0123456789abcdef',arrivedOn:`2026-11-${String(1+i%14).padStart(2,'0')}`,region:`地区${i}`}));
let visits=0;const context=await browser.newContext({viewport:{width:1920,height:1080}});
await context.route('**/api/visitors/visit',r=>{visits++;return r.fulfill({status:200,contentType:'application/json',body:'{"isNew":false}'})});
await context.route(/\/api\/visitors\?/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({total:60,today:4,meteors,meteorId:meteors[20].id})}));
await context.addInitScript(()=>{window.__visitorPaints=0;const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.classList.contains('visitor-canvas'))window.__visitorPaints++;return clear.apply(this,args)}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('https://goblincwl.site/',{waitUntil:'domcontentloaded'});const canvas=page.locator('[data-visitor-sky] canvas');await canvas.waitFor({timeout:60000});await page.waitForTimeout(2500);
const paints=async()=>{const n=await page.evaluate(()=>window.__visitorPaints);await page.waitForTimeout(650);return (await page.evaluate(()=>window.__visitorPaints))-n};
assert.ok(await paints()>0,'visible comets animate');assert.equal(await page.locator('[data-visitor-sky] svg').count(),0);
const box=await canvas.boundingBox();let hovered=false;
for(let y=box.y+20;y<box.y+box.height-10&&!hovered;y+=15)for(let x=box.x+20;x<box.x+box.width-10&&!hovered;x+=15){await page.mouse.move(x,y);hovered=await page.locator('.home-visitor-tooltip:visible').count()>0}
assert.ok(hovered,'canvas hit testing exposes the existing tooltip');await page.mouse.move(100,100);assert.equal(await page.locator('.home-visitor-tooltip:visible').count(),0);
await page.locator('[data-visitors-prev]').click();await page.waitForTimeout(1500);assert.equal(await page.locator('[data-visitors-range]').textContent(),'近7日');assert.equal(await canvas.count(),1);
await page.locator('[data-visitors-next]').click();await page.waitForTimeout(1500);assert.equal(await page.locator('[data-visitors-range]').textContent(),'近30日');assert.equal(await canvas.count(),1);
await page.locator('.global-graph-icon:visible').first().click();await page.locator('.global-graph-container canvas').first().waitFor();await page.waitForTimeout(2000);assert.equal(await paints(),0,'background canvas pauses under expanded graph');
await page.keyboard.press('Escape');await page.waitForTimeout(1000);assert.ok(await paints()>0,'canvas resumes after closing graph');
await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(1500);await page.locator('[data-visitor-sky]').screenshot({path:'/work/interactive-dark.png'});
await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(500);assert.equal(await paints(),0,'reduced motion has a static sky');
await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(500);assert.ok(await paints()>0,'motion resumes');
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1000);await page.locator('[data-visitor-sky]').scrollIntoViewIfNeeded();await page.waitForTimeout(500);assert.ok((await canvas.getAttribute('width'))>0);assert.equal(await canvas.count(),1);await page.locator('[data-visitor-sky]').screenshot({path:'/work/mobile-dark.png'});
assert.deepEqual(errors,[]);assert.ok(visits>0);
const result={passed:true,tooltip:true,rangeTransitions:true,pauseResume:true,reducedMotion:true,resize:true,themes:true,errors,blockedVisits:visits};fs.writeFileSync('/work/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
