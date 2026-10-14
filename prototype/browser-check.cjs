const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file:///D:/SHELVES%202/index.html');
 assert((await page.title()).includes('Shelves'));
 await page.screenshot({path:'desktop.png',fullPage:true});
 await page.locator('.main-nav [data-view="discover"]').click();
 await page.locator('[data-detail="The Overstory"]').first().click();
 await page.locator('select[name="status"]').selectOption({label:'Currently reading'});
 await page.locator('select[name="rating"]').selectOption('5');
 await page.locator('input[name="page"]').fill('120');
 await page.locator('textarea[name="review"]').fill('A beautiful book about connection.');
 await page.getByRole('button',{name:'Save reading update'}).click();
 await page.locator('.main-nav [data-view="shelves"]').click();
 assert.equal(await page.locator('.book-tile').count(),1);
 await page.reload();
 await page.locator('[data-detail="The Overstory"]').first().click();
 assert.equal(await page.locator('input[name="page"]').inputValue(),'120');
 assert.equal(await page.locator('textarea[name="review"]').inputValue(),'A beautiful book about connection.');
 await page.keyboard.press('Escape');
 await page.locator('.main-nav [data-view="discover"]').click();
 assert.equal(await page.locator('[data-detail="The Overstory"]').count(),0);
 await page.locator('[data-dismiss]').first().click();
 assert.equal(await page.locator('.book-tile').count(),4);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: details, status, rating, review persistence, recommendations, dismissal, mobile width, and no runtime errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});


