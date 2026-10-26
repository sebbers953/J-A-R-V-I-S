// Real Electron startup check; requires a graphical display (or Xvfb on Linux).
const { _electron: electron }=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-electron-'));
 const env={...process.env,XDG_CONFIG_HOME:profile,XDG_CACHE_HOME:profile};delete env.OPENAI_API_KEY;
 let app;
 try {
 app=await electron.launch({args:[path.resolve(__dirname,'..'),...(process.platform==='linux'?['--no-sandbox']:[])],env,timeout:20000});
 const page=await app.firstWindow();
 await app.evaluate(({app},profile)=>app.setPath('userData',profile),profile);
 await page.reload();
 await page.locator('#assistant-message').filter({hasText:'CONFIGURATION REQUIRED'}).waitFor();
 assert.equal(await page.evaluate(async()=> (await window.jarvis.assistantStatus()).configured),false);
 const denied=await page.evaluate(async()=>window.jarvis.assistantTurn(new Uint8Array(500),'audio/webm'));
 assert.equal(denied.message,'CONFIGURATION REQUIRED');
 const metrics=await page.evaluate(()=>window.jarvis.metrics());assert(metrics.memoryTotal>0);assert(metrics.storageTotal>0);assert(metrics.uptime>0);
 await page.locator('#task-input').fill('Electron startup check');await page.locator('#task-form button').click();await page.getByLabel('Complete Electron startup check').check();
 await page.locator('#task-status').filter({hasText:'All objectives saved locally.'}).waitFor();
 await page.reload();await page.getByLabel('Complete Electron startup check').waitFor();assert(await page.getByLabel('Complete Electron startup check').isChecked());
 await page.getByLabel('Delete Electron startup check').click();
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
 console.log('PASS: actual Electron starts without a key, CONFIGURATION REQUIRED, real OS metrics, IPC task persistence, isolated renderer');
 } finally {await app?.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
