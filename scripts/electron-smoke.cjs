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
 const network=await page.evaluate(()=>window.jarvis.networkStatus());assert.equal(network.running,false);assert.equal(network.configured,false);assert.equal(network.smart.enabled,false);assert.equal(network.devices.length,0);
 const stopped=await page.evaluate(()=>window.jarvis.networkStop());assert.equal(stopped.ok,true);assert.equal(stopped.network.running,false);assert(await page.evaluate(()=>window.jarvis.networkStop('invalid').then(()=>false,()=>true)));
 const metrics=await page.evaluate(()=>window.jarvis.metrics());assert(metrics.memoryTotal>0);assert(metrics.storageTotal>0);assert(metrics.uptime>0);
 await page.locator('#show-task-form').click();await page.locator('#task-input').fill('Electron startup check');await page.locator('#task-form button').click();await page.getByLabel('Complete Electron startup check').check();
 await page.locator('#task-status').filter({hasText:'All objectives saved locally.'}).waitFor();
 await page.reload();await page.getByLabel('Complete Electron startup check').waitFor();assert(await page.getByLabel('Complete Electron startup check').isChecked());
 await page.getByLabel('Delete Electron startup check').click();
 // Exercise the real preload/IPC/SQLite path, with explicit local-only operations.
 await page.locator('[data-route=memory]').click();await page.locator('#view-memory').waitFor();
 await page.locator('#memory-text').fill('I prefer calm concise replies');await page.locator('#save-memory').click();
 await page.locator('#control-message').filter({hasText:'Memory saved locally.'}).waitFor();
 await page.locator('[data-route=home]').click();await page.reload();await page.locator('[data-route=memory]').click();
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
 await page.locator('[data-route=home]').click();await page.reload();await page.locator('[data-route=memory]').click();assert.equal(await page.locator('#memory-enabled').isChecked(),false);await page.locator('[data-route=home]').click();
 // Six routes share the existing stores; detailed controls stay off HOME.
 await page.locator('[data-route=settings]').click();await page.locator('#view-settings').waitFor();
 await page.locator('#shortcut-name').fill('Reviewed workflow');await page.locator('#approve-shortcut').click();
 await page.locator('#control-message').filter({hasText:'Shortcut allowlisted'}).waitFor();assert.match(await page.locator('#shortcut-list').innerText(),/Reviewed workflow/);
 if(process.platform==='linux'){
  const approved=path.join(profile,'approved');fs.mkdirSync(approved);fs.writeFileSync(path.join(approved,'notes.txt'),'Local journal fixture.');
  await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},approved);
  await page.locator('#approve-folder').click();await page.locator('#control-message').filter({hasText:'Folder approved'}).waitFor();
 }
 await page.locator('[data-route=home]').click();await page.locator('[data-quick=mac]').click();await page.locator('#run-shortcut-name').selectOption('Reviewed workflow');await page.locator('#run-shortcut').click();
 await page.locator('#action-proposal').waitFor();assert.match(await page.locator('#action-description').innerText(),/Reviewed workflow/);await page.locator('#deny-action').click();await page.locator('#action-proposal').waitFor({state:'hidden'});
 if(process.platform==='linux'){
  await page.locator('[data-quick=files]').click();await page.waitForFunction(()=>document.querySelector('#file-folder').value!=='');await page.locator('#file-path').fill('notes.txt');await page.locator('#read-file').click();await page.locator('#file-result').filter({hasText:'Local journal fixture.'}).waitFor();await page.locator('#close-quick').click();
 }
 await page.locator('[data-route=system]').click();await page.locator('#view-system').waitFor();assert((await page.locator('#ram-total').innerText())!=='—');assert(await page.locator('#view-system #system-panel').count()===1);
 await page.locator('[data-route=tasks]').click();await page.locator('#view-tasks').waitFor();assert(await page.locator('#view-tasks #task-form').isVisible());
 await page.locator('[data-route=history]').click();await page.locator('#view-history').waitFor();assert.match(await page.locator('#history-log').innerText(),/Action cancelled/);
 await page.locator('[data-route=home]').click();assert(await page.locator('#memory-text').isHidden());assert(await page.locator('#silence-seconds').isHidden());assert.equal(await page.locator('.orbit,.arc-outer,.scanner').count(),0);
 const created=await page.evaluate(()=>window.jarvis.control({kind:'action',action:{kind:'task-create',text:'Voice task integration'}}));assert.equal(created.ok,true);
 await page.reload();await page.getByLabel('Complete Voice task integration').waitFor();
 const completed=await page.evaluate(()=>window.jarvis.control({kind:'action',action:{kind:'task-complete',text:'Voice task integration'}}));assert.equal(completed.ok,true);
 await page.reload();assert(await page.getByLabel('Complete Voice task integration').isChecked());
 assert.equal((await page.evaluate(()=>window.jarvis.control({kind:'action',action:{kind:'shell',command:'unsupported'}}))).ok,false);
 // A second BrowserWindow has the same preload but is not the authorized HUD.
 const denied=await app.evaluate(async({BrowserWindow},preload)=>{
  const other=new BrowserWindow({show:false,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
  try {await other.loadURL('about:blank');return await other.webContents.executeJavaScript(`Promise.all([window.jarvis.control({kind:'memory-list'}),window.jarvis.assistantHealth(),window.jarvis.networkStatus(),window.jarvis.networkStop()].map(p=>p.then(()=>false,()=>true))).then(results=>results.every(Boolean))`);}finally{other.destroy();}
 },path.resolve(__dirname,'../dist/electron/electron/preload.js'));
 assert(denied,'IPC from an unrelated window must be rejected');
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
 const health=await page.evaluate(()=>window.jarvis.assistantHealth());assert.equal(typeof health.available,'boolean');assert.equal(health.model,'llama3.1:8b');
 // Real main-window hide/show signal must stop the integrated core even where
 // Chromium's document visibility is overridden by automation flags.
 await page.evaluate(()=>{window.nativeVisibility=[];window.unsubVisibility=window.jarvis.onWindowVisibility(value=>window.nativeVisibility.push(value));});
 await page.waitForTimeout(150);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].hide());
 await page.waitForFunction(()=>window.nativeVisibility.includes(false),null,{polling:100});await page.waitForTimeout(150);
 const paused=await page.locator('.moon-core canvas').evaluate(canvas=>canvas.toDataURL());await page.waitForTimeout(500);assert.equal(await page.locator('.moon-core canvas').evaluate(canvas=>canvas.toDataURL()),paused);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());await page.waitForFunction(()=>window.nativeVisibility.at(-1)===true,null,{polling:100});await page.evaluate(()=>window.unsubVisibility());

 await page.waitForTimeout(1500);await app.evaluate(({app})=>app.getAppMetrics());await page.waitForTimeout(3000);
 console.log('Idle Electron process samples (cloud, not M4 GPU utilization):',await app.evaluate(({app})=>({gpu:app.getGPUFeatureStatus().gpu_compositing,processes:app.getAppMetrics().map(p=>({type:p.type,cpuPercent:p.cpu.percentCPUUsage}))})));
 console.log('PASS: actual Electron starts without any API key and initializes the local assistant, real OS metrics, IPC task persistence, isolated renderer, SQLite memory CRUD/export/disable, task commands, V2 navigation, approved file reads, shortcut confirmation, real health, hidden-window pause, rejected action and unauthorized-window IPC');
 } finally {await app?.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
