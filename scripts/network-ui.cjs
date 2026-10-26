// All LAN responses here are labelled fixtures; this script sends no discovery packets.
const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.networkCalls=[];window.radarPaints=0;const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.closest('#network-radar'))window.radarPaints++;return clear.apply(this,args);};
   const iface={id:'fixture',name:'Fixture interface',address:'192.168.4.2',netmask:'255.255.255.0'};
   window.networkFixture={running:false,active:false,configured:false,interface:null,interfaces:[iface],endsAt:null,devices:[],errors:[],smart:{configured:false,enabled:false,lights:[],error:null}};
   const state=()=>structuredClone(window.networkFixture);window.jarvis={
    networkStatus:async()=>state(),networkStop:async revoke=>{window.networkCalls.push('stop');window.networkFixture.running=false;if(revoke){window.networkFixture.configured=false;window.networkFixture.interface=null;window.networkFixture.active=false;}return {ok:true,text:'Fixture discovery stopped.',network:state()};},
    assistantStatus:async()=>({configured:true}),assistantCancel:async()=>{},assistantHealth:async()=>({available:false,installed:false,model:'llama3.1:8b',voice:'bm_george'}),
    metrics:async()=>({hostname:'UI fixture',platform:'darwin',cpu:0,memoryUsed:null,memoryTotal:24*1024**3,memoryPressure:null,battery:null,charging:null,storageTotal:null,storageUsed:null,uptime:1}),loadTasks:async()=>[],saveTasks:async()=>{},fullscreen:async()=>{},
    control:async q=>{
     if(q.kind!=='network')return {ok:true,text:'Fixture settings',memories:[],enabled:true,folders:[],shortcuts:[]};
     const request=q.request;window.networkCalls.push(request.kind);
     if(request.kind==='configure'){if(!request.authorized)return {ok:false,text:'Authorize your own local network first.'};window.networkFixture.configured=true;window.networkFixture.interface=iface;window.networkFixture.active=request.active;}
     if(request.kind==='start'){window.networkFixture.running=true;window.networkFixture.endsAt=Date.now()+60000;window.networkFixture.devices=[{id:'fixture-speaker',name:'Fixture speaker',hostname:'fixture-speaker.local',ip:'192.168.4.55',mac:null,type:'Unknown',protocols:['mDNS'],status:'online',statusReason:'UI fixture, not a real device',firstSeen:Date.now(),lastSeen:Date.now(),expires:Date.now()+45000,latencyMs:null}];}
     return {ok:true,text:'Fixture operation completed.',network:state()};
    }
   };
  });
  await page.goto('http://localhost:4173');await page.locator('[data-route=system]').click();await page.locator('#system-network-tab').click();
  await page.locator('#network-mode').filter({hasText:'DISCOVERY STOPPED'}).waitFor();assert.deepEqual(await page.evaluate(()=>window.networkCalls),[]);
  await page.locator('#network-demo').click();await page.waitForFunction(()=>document.querySelector('#network-total').textContent==='4');
  assert.match(await page.locator('#network-mode').innerText(),/SIMULATED DEVICES/);assert.deepEqual(await page.evaluate(()=>window.networkCalls.filter(call=>call!=='stop')),[]);assert(await page.locator('#network-start').isDisabled());
  await page.locator('.network-device').first().click();assert.match(await page.locator('#network-details').innerText(),/192\.0\.2\./);assert.match(await page.locator('#network-details').innerText(),/Not measured/);
  await page.screenshot({path:'/workspace/jarvis-network-demo.png',fullPage:true});
  const profiler=await page.context().newCDPSession(page);await profiler.send('Performance.enable');const metrics=async()=>Object.fromEntries((await profiler.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  const before=await metrics(),beforePaint=await page.evaluate(()=>window.radarPaints);await page.waitForTimeout(2000);const after=await metrics(),painted=await page.evaluate(()=>window.radarPaints)-beforePaint;assert(painted>10&&painted<=60);
  console.log(JSON.stringify({demoRadarPaintsPerSecond:painted/2,cloudRendererTaskCpuPercent:(after.TaskDuration-before.TaskDuration)/2*100,physicalM4GPUVerified:false}));
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150);const quiet=await page.evaluate(()=>window.radarPaints);await page.waitForTimeout(500);assert((await page.evaluate(()=>window.radarPaints))-quiet<=1);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#network-live').click();assert.equal(await page.locator('#network-total').innerText(),'0');assert(await page.locator('#network-details').innerText().then(value=>!value.includes('Demo laptop')));
  await page.locator('#network-start').click();await page.locator('#network-feedback').filter({hasText:'Authorize your own'}).waitFor();assert(!((await page.evaluate(()=>window.networkCalls)).includes('start')));
  await page.locator('#network-authorized').check();await page.locator('#network-start').click();await page.locator('#network-mode').filter({hasText:'ACTIVE'}).waitFor();assert.equal(await page.locator('#network-total').innerText(),'1');assert.equal(await page.locator('#network-online').innerText(),'1');assert(await page.locator('#network-banner').isVisible());
  await page.locator('#network-authorized').uncheck();await page.waitForFunction(()=>!window.networkFixture.running&&!window.networkFixture.configured);assert.equal(await page.locator('#network-authorized').isChecked(),false);
  await page.locator('#network-authorized').check();await page.locator('#network-start').click();await page.locator('#network-mode').filter({hasText:'ACTIVE'}).waitFor();
  await page.evaluate(()=>{window.savedStatus=window.jarvis.networkStatus;window.jarvis.networkStatus=async()=>{throw new Error('fixture unavailable');};dispatchEvent(new Event('jarvis-action-complete'));});
  await page.locator('#network-mode').filter({hasText:'STATUS UNAVAILABLE'}).waitFor();assert.equal(await page.locator('#network-online').innerText(),'0');assert.match(await page.locator('.network-device').innerText(),/UNKNOWN/);
  await page.evaluate(()=>{window.jarvis.networkStatus=window.savedStatus;dispatchEvent(new Event('jarvis-action-complete'));});await page.locator('#network-mode').filter({hasText:'ACTIVE'}).waitFor();
  await page.locator('#network-stop').click();await page.locator('#network-mode').filter({hasText:'STOPPED'}).waitFor();assert.equal(await page.locator('#network-online').innerText(),'0');assert.match(await page.locator('.network-device').innerText(),/UNKNOWN/);
  await page.locator('#network-demo').click();await page.waitForTimeout(700);await page.locator('[data-route=home]').click();await page.waitForTimeout(150);const paused=await page.evaluate(()=>window.radarPaints);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.radarPaints),paused);
  for(const width of [390,1280,1512]){await page.setViewportSize({width,height:982});await page.locator('[data-route=system]').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Network view overflow');await page.locator('[data-route=home]').click();}
  assert.deepEqual(errors,[]);console.log('PASS: labelled demo isolation, no automatic discovery, explicit authorization, live fixture status, stop/stale semantics, optional metadata, reduced motion, hidden radar pause and responsive layout');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
