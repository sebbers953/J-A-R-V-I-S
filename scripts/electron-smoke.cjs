// Real Electron startup check; requires a graphical display (or Xvfb on Linux).
const { _electron: electron }=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-electron-'));
 const env={...process.env,XDG_CONFIG_HOME:profile,XDG_CACHE_HOME:profile};for(const name of ['GROK_API_KEY','FISH_AUDIO_API_KEY','XAI_API_KEY','OPENAI_API_KEY']) delete env[name];
 let app;
 try {
 app=await electron.launch({args:[path.resolve(__dirname,'..'),`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox']:[])],env,timeout:20000});
 const page=await app.firstWindow();
 const userData=await app.evaluate(({app})=>app.getPath('userData'));
 assert(userData.startsWith(profile),'Electron smoke must use an isolated profile');
 await page.reload();
 await page.locator('#assistant-message').filter({hasText:'Ollama'}).waitFor();
 assert.equal(await page.evaluate(async()=> (await window.jarvis.assistantStatus()).configured),true);
 const metrics=await page.evaluate(()=>window.jarvis.metrics());assert(metrics.memoryTotal>0);assert(metrics.storageTotal>0);assert(metrics.uptime>0);
 await page.locator('#task-input').fill('Electron startup check');await page.locator('#task-form button').click();await page.getByLabel('Complete Electron startup check').check();
 await page.locator('#task-status').filter({hasText:'All objectives saved locally.'}).waitFor();
 await page.reload();await page.getByLabel('Complete Electron startup check').waitFor();assert(await page.getByLabel('Complete Electron startup check').isChecked());
 await page.getByLabel('Delete Electron startup check').click();
 // Exercise the real preload/IPC/SQLite path, with explicit local-only operations.
 await page.locator('#manage-local').click();await page.locator('#local-controls').waitFor();
 await page.locator('#memory-text').fill('I prefer calm concise replies');await page.locator('#save-memory').click();
 await page.locator('#control-message').filter({hasText:'Memory saved locally.'}).waitFor();
 await page.locator('#close-controls').click();await page.reload();await page.locator('#manage-local').click();
 await page.locator('#memory-list').filter({hasText:'I prefer calm concise replies'}).waitFor();
 const exported=path.join(profile,'jarvis-memory-export.json');
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exported);
 await page.locator('#export-memory').click();await page.locator('#control-message').filter({hasText:'Memory exported'}).waitFor();
 assert.equal(JSON.parse(fs.readFileSync(exported,'utf8')).memories[0].text,'I prefer calm concise replies');
 assert.equal(fs.statSync(exported).mode&0o777,0o600);
 await page.locator('#memory-list button').filter({hasText:'Delete'}).click();
 await page.locator('#action-proposal').waitFor();assert((await page.evaluate(()=>window.jarvis.control({kind:'memory-list'}))).memories.length===1);
 await page.locator('#confirm-action').click();await page.locator('#control-message').filter({hasText:'Memory deleted.'}).waitFor();
 await page.locator('#memory-enabled').uncheck();await page.locator('#control-message').filter({hasText:'Memory disabled.'}).waitFor();
 await page.locator('#close-controls').click();await page.reload();await page.locator('#manage-local').click();assert.equal(await page.locator('#memory-enabled').isChecked(),false);await page.locator('#close-controls').click();
 const created=await page.evaluate(()=>window.jarvis.control({kind:'action',action:{kind:'task-create',text:'Voice task integration'}}));assert.equal(created.ok,true);
 await page.reload();await page.getByLabel('Complete Voice task integration').waitFor();
 const completed=await page.evaluate(()=>window.jarvis.control({kind:'action',action:{kind:'task-complete',text:'Voice task integration'}}));assert.equal(completed.ok,true);
 await page.reload();assert(await page.getByLabel('Complete Voice task integration').isChecked());
 assert.equal((await page.evaluate(()=>window.jarvis.control({kind:'action',action:{kind:'shell',command:'unsupported'}}))).ok,false);
 // A second BrowserWindow has the same preload but is not the authorized HUD.
 const denied=await app.evaluate(async({BrowserWindow},preload)=>{
  const other=new BrowserWindow({show:false,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  try {await other.loadURL('about:blank');return await other.webContents.executeJavaScript(`window.jarvis.control({kind:'memory-list'}).then(()=>false,()=>true)`);}finally{other.destroy();}
 },path.resolve(__dirname,'../dist/electron/electron/preload.js'));
 assert(denied,'IPC from an unrelated window must be rejected');
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
 console.log('PASS: actual Electron starts without any API key and initializes the local assistant, real OS metrics, IPC task persistence, isolated renderer, SQLite memory CRUD/export/disable, task commands, rejected action and unauthorized-window IPC');
 } finally {await app?.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
