const {chromium}=require('/app/node_modules/playwright'),assert=require('node:assert/strict'),fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});const report=[];
 for(const [name,viewport] of [['desktop',{width:1920,height:1080}],['mobile',{width:390,height:844}]]){
  const context=await browser.newContext({viewport});await context.route('**/api/visitors/visit',r=>r.fulfill({status:200,contentType:'application/json',body:'{"isNew":false}'}));
  const page=await context.newPage(),sources=new Map(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async response=>{if(response.url().includes('/api/site/content/reading?')){try{const data=await response.json();sources.set(data.page,data.items)}catch{}}});
  await page.goto('https://goblincwl.site/reading/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>[...document.querySelectorAll('.reading-sheet')].filter(el=>!el.closest('[data-reading-pending]')).length>=1,{timeout:60000});await page.waitForTimeout(1500);
  const ordered=()=>page.evaluate(()=>[...document.querySelectorAll('.reading-sheet')].filter(el=>!el.closest('[data-reading-pending]')).map(el=>({id:el.dataset.readingId,title:el.querySelector('h2')?.textContent,...(()=>{let top=0,left=0,node=el;while(node){top+=node.offsetTop;left+=node.offsetLeft;node=node.offsetParent}return{top,left}})()})).sort((a,b)=>Math.round(a.top)-Math.round(b.top)||a.left-b.left));
  let cards=await ordered();const expected=()=>[...sources].sort((a,b)=>a[0]-b[0]).flatMap(([,items])=>items).filter(item=>!item.encrypted&&!/🔐[βγ]|\[加密文本\]/.test(item.excerpt)).slice(0,cards.length).map(x=>x.id);
  assert.deepEqual(cards.map(x=>x.id),expected(),name+' visual order must equal API chronological order');
  await page.locator('.reading-sheet').first().evaluate(el=>el.scrollIntoView({block:'start'}));await page.waitForTimeout(300);await page.screenshot({path:'/work/'+name+'.png'});const firstPageCount=cards.length;
  if(name==='desktop'){
   await page.locator('[data-reading-sentinel]').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>window.dispatchEvent(new Event('scroll')));await page.waitForFunction(count=>[...document.querySelectorAll('.reading-sheet')].filter(el=>!el.closest('[data-reading-pending]')).length>count,firstPageCount,{timeout:10000}).catch(async error=>{console.log('pagination debug',await page.evaluate(()=>({count:[...document.querySelectorAll('.reading-sheet')].filter(el=>!el.closest('[data-reading-pending]')).length,scroll:window.scrollY,height:document.body.scrollHeight,sentinel:document.querySelector('[data-reading-sentinel]').getBoundingClientRect().toJSON(),error:document.querySelector('.reading-error')?.textContent})));throw error});await page.waitForTimeout(1500);cards=await ordered();assert.deepEqual(cards.map(x=>x.id),expected(),'pagination must retain visual order');
  }
  assert.deepEqual(errors,[]);report.push({name,firstPageCount,checked:cards.length,ordered:true,errors,titles:cards.slice(0,6).map(x=>x.title)});await context.close();
 }
 fs.writeFileSync('/work/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
