// Isolated celestial component fixture: never mounts or recolors the existing HUD.
const {chromium,_electron:electron}=require('@playwright/test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const http=require('node:http');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-core-'));let browser,server;
 try {
  const source=path.resolve(__dirname,'../src/renderer/core/state-bridge.ts');
  await fs.writeFile(path.join(dir,'entry.ts'),`import {connectCoreToHud} from ${JSON.stringify(source)};window.visual=connectCoreToHud(document.getElementById('host'),window.nativeVisibility?.subscribe);`);
  await fs.writeFile(path.join(dir,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#050204;display:grid;place-items:center;min-height:100vh}#host{width:min(90vw,650px);aspect-ratio:1;position:relative}#sentinel{position:fixed;left:0;top:0;color:white;font:14px Arial}</style></head><body data-voice="idle"><span id="sentinel">Fixture only · existing HUD untouched</span><div id="host"></div><script type="module" src="./entry.ts"></script></body></html>`);
  const {build}=await import('vite');await build({root:dir,configFile:false,logLevel:'error',build:{outDir:path.join(dir,'dist')}});
  server=http.createServer(async(req,res)=>{try{const filename=path.join(dir,'dist',new URL(req.url,'http://localhost').pathname);const bytes=await fs.readFile(filename.endsWith(path.sep)?filename+'index.html':filename);res.setHeader('Content-Type',filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html');res.end(bytes);}catch{res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium'),headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1000,height:800}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.visual?.core.snapshot().frames>10);
  assert.equal(await page.locator('.moon-core__lettering').innerText(),'J A R V I S');assert.equal(await page.locator('#host canvas').count(),1);assert.equal(await page.locator('#host .orbit').count(),0);
  for(const state of ['listening','processing','speaking','action','error','idle']) {
    await page.evaluate(s=>{document.body.dataset.voice=s;document.body.style.setProperty('--audio-level','.7');},state);
    await page.waitForFunction(s=>document.querySelector('.moon-core').dataset.state===(s==='processing'?'thinking':s),state);
  }
  await page.evaluate(()=>dispatchEvent(new Event('jarvis-action-complete')));assert((await page.evaluate(()=>window.visual.core.snapshot())).actionPulseActive);
  const transform=await page.locator('.moon-core__lettering').evaluate(el=>getComputedStyle(el).transform);assert.equal(transform,'none');
  await page.screenshot({path:process.env.CORE_SCREENSHOT_PATH||path.join(os.tmpdir(),'jarvis-moon-core.png')});
  const client=await page.context().newCDPSession(page);await client.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const before=await metrics(),start=await page.evaluate(()=>window.visual.core.snapshot());await page.waitForTimeout(4000);const after=await metrics(),end=await page.evaluate(()=>window.visual.core.snapshot());
  const fps=(end.frames-start.frames)/4,drawMs=(end.drawingMs-start.drawingMs)/4;
  assert(fps>10&&fps<=32,`Unexpected paint cadence: ${fps}`);assert(end.textureUpdates-start.textureUpdates<=9);
  console.log(JSON.stringify({idlePaintsPerSecond:fps,canvasDrawingMsPerSecond:drawMs,rendererTaskCpuPercent:(after.TaskDuration-before.TaskDuration)/4*100,heapMB:after.JSHeapUsedSize/1024**2}));
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);const reduced=await page.evaluate(()=>window.visual.core.snapshot());await page.waitForTimeout(500);assert.equal((await page.evaluate(()=>window.visual.core.snapshot())).frames,reduced.frames);assert.equal(reduced.running,false);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(200);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));const hidden=await page.evaluate(()=>window.visual.core.snapshot());await page.waitForTimeout(500);assert.equal((await page.evaluate(()=>window.visual.core.snapshot())).frames,hidden.frames);assert.equal(hidden.running,false);
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));await page.waitForTimeout(200);assert((await page.evaluate(()=>window.visual.core.snapshot())).frames>hidden.frames);
  // Real hidden-document lifecycle through a second foreground page.
  const other=await page.context().newPage();await other.goto('about:blank');await other.bringToFront();
  if(await page.evaluate(()=>document.hidden)){const paused=await page.evaluate(()=>window.visual.core.snapshot());await page.waitForTimeout(400);assert.equal((await page.evaluate(()=>window.visual.core.snapshot())).frames,paused.frames);}
  await page.bringToFront();await page.evaluate(()=>window.visual.destroy());assert.equal(await page.locator('#host canvas').count(),0);assert.deepEqual(errors,[]);
  if(process.env.CORE_ELECTRON_SMOKE==='1') {
    const profile=path.join(dir,'electron-profile'),preload=path.join(dir,'visibility-preload.cjs');
    await fs.writeFile(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('nativeVisibility',{subscribe(callback){const handler=(_event,value)=>{if(typeof value==='boolean')callback(value);};ipcRenderer.on('core:visibility',handler);return ()=>ipcRenderer.removeListener('core:visibility',handler);}});`);
    const native=await electron.launch({args:[path.resolve(__dirname,'..'),`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox']:[])],env:{...process.env,XDG_CONFIG_HOME:profile,XDG_CACHE_HOME:profile},timeout:20000});
    try {
      await native.firstWindow();const created=native.waitForEvent('window');
      await native.evaluate(async({BrowserWindow},{url,preload})=>{
        for(const window of BrowserWindow.getAllWindows())window.hide();
        globalThis.coreFixture=new BrowserWindow({width:850,height:850,show:true,backgroundColor:'#050204',webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
        const fixture=globalThis.coreFixture;for(const event of ['hide','minimize'])fixture.on(event,()=>fixture.webContents.send('core:visibility',false));for(const event of ['show','restore'])fixture.on(event,()=>fixture.webContents.send('core:visibility',true));
        await fixture.loadURL(url);
      },{url:`http://127.0.0.1:${server.address().port}`,preload});
      const fixture=await created;await fixture.waitForFunction(()=>window.visual?.core.snapshot().frames>5);
      await native.evaluate(()=>globalThis.coreFixture.hide());await fixture.waitForFunction(()=>!window.visual.core.snapshot().running,null,{polling:100});
      const paused=await fixture.evaluate(()=>window.visual.core.snapshot());await fixture.waitForTimeout(500);assert.equal((await fixture.evaluate(()=>window.visual.core.snapshot())).frames,paused.frames);assert.equal(paused.running,false);
      await native.evaluate(()=>globalThis.coreFixture.show());await fixture.waitForFunction(frames=>window.visual.core.snapshot().frames>frames,paused.frames);
      const gpu=await native.evaluate(({app})=>({compositing:app.getGPUFeatureStatus().gpu_compositing,rasterization:app.getGPUFeatureStatus().rasterization}));
      console.log(JSON.stringify({electronHiddenWindowPaused:true,gpu}));
    }finally{await native.close();}
  }
  console.log('PASS: isolated moon component, all state mappings, stationary lettering, capped frame/texture cadence, reduced motion, page lifecycle pause/resume and cleanup');
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
