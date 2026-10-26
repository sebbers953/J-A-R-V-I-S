const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
 try {
 const context = await browser.newContext({ viewport:{width:1440,height:1000}, permissions:['microphone'] });
 const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173'); await page.locator('#task-status').filter({hasText:'saved in this browser'}).waitFor();
 await page.locator('#task-input').fill('Run system diagnostics'); await page.locator('#task-form button').click();
 await page.getByLabel('Complete Run system diagnostics').check();
 await page.reload(); await page.getByLabel('Complete Run system diagnostics').waitFor(); assert(await page.getByLabel('Complete Run system diagnostics').isChecked());
 assert.match(await page.locator('#completion').innerText(),/100%/);
 const first = await page.locator('#clock').innerText(); await page.waitForTimeout(1100); assert.notEqual(await page.locator('#clock').innerText(),first);
 await page.locator('#microphone').click(); await page.locator('#mic-status').filter({hasText:'MICROPHONE LIVE'}).waitFor();
 await page.screenshot({path:'/workspace/jarvis-hud.png',fullPage:true});
 await page.locator('#microphone').click(); assert.equal(await page.locator('#mic-status').innerText(),'MICROPHONE OFF');
 await page.getByLabel('Delete Run system diagnostics').click(); await page.reload(); await page.locator('.empty').waitFor();
 await page.setViewportSize({width:390,height:844}); assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
 assert.deepEqual(errors,[]); console.log('PASS: task add/complete/reload/delete, clock tick, simulated microphone enable/disable, mobile width, no renderer errors');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
