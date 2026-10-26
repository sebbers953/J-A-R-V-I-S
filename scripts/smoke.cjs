const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// Feed a known tone through Chromium's real getUserMedia pipeline.
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-audio-'));
const fixturePath = path.join(fixtureDir,'tone.wav');
const rate=48000, count=rate*4, wav=Buffer.alloc(44+count*2);
wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++) wav.writeInt16LE(Math.round((i<rate*2?Math.sin(i*2*Math.PI*440/rate)*24000:0)),44+i*2);
fs.writeFileSync(fixturePath,wav);
(async () => {
 const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${fixturePath}`] });
 try {
 const context = await browser.newContext({ viewport:{width:1440,height:1000}, permissions:['microphone'] });
 const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173'); assert.equal(await page.locator('#mic-status').innerText(),'IDLE'); await page.locator('#assistant-message').filter({hasText:'CONFIGURATION REQUIRED'}).waitFor();
 await page.locator('#microphone').click(); assert.equal(await page.locator('#mic-status').innerText(),'IDLE');
 await context.addInitScript(({voice})=>{
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.testStreams=[];
  navigator.mediaDevices.getUserMedia=async opts=>{const stream=await original(opts);window.testStreams.push(stream);return stream;};
  window.jarvis={assistantHealth:async()=>({available:true,installed:true,model:'llama3.1:8b',voice:'bm_george'}),assistantStatus:async()=>({configured:true}),assistantCancel:async()=>{},assistantTurn:async()=>{window.voiceTurns=(window.voiceTurns||0)+1;await new Promise(r=>setTimeout(r,350));return {ok:true,user:'Hello Jarvis',text:'Hello Seb.',audio:voice};},
   metrics:async()=>({platform:'darwin',hostname:'Test Mac',cpu:37,memoryUsed:8*1024**3,memoryTotal:16*1024**3,storageUsed:250*1024**3,storageTotal:500*1024**3,uptime:7380,battery:68,charging:false}),loadTasks:async()=>JSON.parse(localStorage.getItem('jarvis-tasks')||'[]'),saveTasks:async tasks=>localStorage.setItem('jarvis-tasks',JSON.stringify(tasks)),fullscreen:async()=>{}};
 },{voice:wav.toString('base64')});
 await page.reload();await page.locator('#task-status').filter({hasText:'Saved on this device'}).waitFor();
 await page.locator('#show-task-form').click();await page.locator('#task-input').fill('Run system diagnostics'); await page.locator('#task-form button').click();
 await page.getByLabel('Complete Run system diagnostics').check();
 await page.reload(); await page.getByLabel('Complete Run system diagnostics').waitFor(); assert(await page.getByLabel('Complete Run system diagnostics').isChecked());
 assert.match(await page.locator('#completion').innerText(),/100%/);
 const first = await page.locator('#clock').innerText(); await page.waitForTimeout(1100); assert.notEqual(await page.locator('#clock').innerText(),first);
 await page.locator('#microphone').click(); await page.locator('#mic-status').filter({hasText:'LISTENING'}).waitFor();
 await page.waitForFunction(()=>{const canvas=document.querySelector('#waveform'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;if(!w||!h)return false;const data=ctx.getImageData(0,0,w,Math.max(1,Math.floor(h/2)-2)).data;return data.some((value,i)=>i%4===3&&value>0);},null,{timeout:6500});
 await page.screenshot({path:'/workspace/jarvis-hud.png',fullPage:true});
 await page.locator('#microphone').click(); assert.equal(await page.locator('#mic-status').innerText(),'MUTED');
 await page.locator('#microphone').click();await page.locator('#mic-status').filter({hasText:'LISTENING'}).waitFor();await page.waitForTimeout(600);
 await page.locator('#send-voice').click();await page.locator('#core-status').filter({hasText:'THINKING'}).waitFor();
 assert(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),'No capture may continue while processing');
 await page.locator('#core-status').filter({hasText:'SPEAKING'}).waitFor();assert(await page.locator('#send-voice').isDisabled());assert.equal(await page.locator('.moon-core').getAttribute('data-state'),'speaking');
 assert.match(await page.locator('#conversation').innerText(),/USER: Hello Jarvis/);assert.match(await page.locator('#conversation').innerText(),/JARVIS: Hello Seb/);
 assert(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),'Playback must never capture its own output');
 await page.locator('#core-status').filter({hasText:'IDLE'}).waitFor();
 // Continuous conversation requires explicit opt-in, auto-sends after real silence,
 // keeps input stopped through playback, then reopens exactly once.
 assert.equal(await page.locator('#continuous-voice').isChecked(),false);
 const beforeTurns=await page.evaluate(()=>window.voiceTurns);
 await page.locator('#continuous-voice').check();await page.locator('#microphone').click();
 await page.locator('#core-status').filter({hasText:'LISTENING'}).waitFor();
 await page.locator('#core-status').filter({hasText:'THINKING'}).waitFor({timeout:10000});
 await page.locator('#core-status').filter({hasText:'SPEAKING'}).waitFor();
 assert(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 await page.locator('#core-status').filter({hasText:'LISTENING'}).waitFor({timeout:10000});
 assert.equal(await page.evaluate(()=>window.voiceTurns),beforeTurns+1);
 await page.locator('#interrupt-voice').click();assert.equal(await page.locator('#core-status').innerText(),'INTERRUPTED');
 assert.equal(await page.locator('#continuous-voice').isChecked(),false);
 assert(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 // Interrupt audible playback immediately and ignore the old onended callback.
 await page.locator('#microphone').click();await page.waitForTimeout(500);await page.locator('#send-voice').click();
 await page.locator('#core-status').filter({hasText:'SPEAKING'}).waitFor();await page.locator('#interrupt-voice').click();
 assert.equal(await page.locator('#core-status').innerText(),'INTERRUPTED');await page.waitForTimeout(500);assert.equal(await page.locator('#core-status').innerText(),'INTERRUPTED');
 await page.locator('#microphone').click();await page.locator('#mic-status').filter({hasText:'LISTENING'}).waitFor();await page.waitForTimeout(350);
 await page.locator('#send-voice').click();await page.locator('#core-status').filter({hasText:'THINKING'}).waitFor();await page.locator('#microphone').click();
 await page.waitForTimeout(600);assert.equal(await page.locator('#core-status').innerText(),'MUTED','Late reply must not override cancellation');
 // A proposed action remains blocked until an explicit click; its verified result
 // must be visible in the HUD even when the management dialog is closed.
 await page.evaluate(()=>{
  window.actionPulses=0;window.addEventListener('jarvis-action-complete',()=>window.actionPulses++);window.originalTurn=window.jarvis.assistantTurn;
  window.jarvis.assistantTurn=async()=>({...await window.originalTurn(),user:'Open Safari',text:'Confirmation required.',proposal:{id:'test-proposal',description:'Open Safari (test adapter only).'}});
  window.jarvis.control=async request=>{window.confirmRequest=request;return {ok:true,text:'Safari launch verified by test adapter.'};};
 });
 await page.locator('#continuous-voice').check();await page.locator('#microphone').click();await page.waitForTimeout(500);await page.locator('#send-voice').click();
 await page.locator('#core-status').filter({hasText:'SPEAKING'}).waitFor();await page.locator('#action-proposal').waitFor();
 assert.equal(await page.evaluate(()=>window.confirmRequest),undefined);assert.equal(await page.evaluate(()=>window.actionPulses),0);
 await page.locator('#confirm-action').click();await page.locator('#assistant-message').filter({hasText:'Safari launch verified by test adapter.'}).waitFor();
 assert.equal(await page.locator('#core-status').innerText(),'IDLE');assert.equal(await page.locator('#continuous-voice').isChecked(),false);
 assert.match(await page.locator('#conversation').innerText(),/Safari launch verified by test adapter/);
 assert.equal(await page.evaluate(()=>window.confirmRequest.id),'test-proposal');assert.equal(await page.evaluate(()=>window.actionPulses),1);
 await page.evaluate(()=>{window.jarvis.control=async()=>({ok:false,text:'Test action could not be verified. No success reported.'});});
 await page.locator('#microphone').click();await page.waitForTimeout(500);await page.locator('#send-voice').click();
 await page.locator('#action-proposal').waitFor();await page.locator('#confirm-action').click();
 await page.locator('#assistant-message').filter({hasText:'Test action could not be verified'}).waitFor();assert.equal(await page.locator('#core-status').innerText(),'ERROR');assert.equal(await page.evaluate(()=>window.actionPulses),1);
 await page.evaluate(()=>{window.jarvis.control=async()=>{await new Promise(r=>setTimeout(r,600));return {ok:true,text:'STALE CONTROL RESULT'};};});
 await page.locator('#microphone').click();await page.waitForTimeout(500);await page.locator('#send-voice').click();
 await page.locator('#action-proposal').waitFor();await page.locator('#confirm-action').click();await page.locator('#interrupt-voice').click();
 await page.waitForTimeout(900);assert.equal(await page.locator('#core-status').innerText(),'INTERRUPTED');assert(!((await page.locator('#conversation').innerText()).includes('STALE CONTROL RESULT')));
 await page.evaluate(()=>{window.jarvis.assistantTurn=async()=>({ok:false,message:'Connection or API unavailable. Please try again.'});});
 await page.locator('#microphone').click();await page.locator('#mic-status').filter({hasText:'LISTENING'}).waitFor();await page.waitForTimeout(350);await page.locator('#send-voice').click();
 await page.locator('#assistant-message').filter({hasText:'Connection or API unavailable'}).waitFor();assert.equal(await page.locator('#core-status').innerText(),'ERROR');
 // Voice-only navigation must show live observations, stop continuous capture,
 // and preserve the current spoken reply without reopening a hidden microphone.
 await page.evaluate(()=>{window.jarvis.assistantTurn=async()=>({...await window.originalTurn(),user:'Show connected devices',text:'No live devices are observed in this fixture.',view:'network'});});
 await page.locator('#continuous-voice').check();await page.locator('#microphone').click();await page.waitForTimeout(500);await page.locator('#send-voice').click();
 await page.locator('#network-module').waitFor();await page.waitForFunction(()=>document.body.dataset.voice==='speaking');
 assert.equal(await page.locator('#network-module').getAttribute('data-mode'),'live');assert.equal(await page.locator('#continuous-voice').isChecked(),false);
 assert(await page.evaluate(()=>window.testStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))));
 await page.waitForFunction(()=>document.body.dataset.voice==='idle');await page.locator('[data-route=home]').click();
 await page.locator('[data-route=history]').click();assert(await page.locator('#history-log .history-turn').count()>0);await page.locator('[data-route=home]').click();
 await page.getByLabel('Delete Run system diagnostics').click(); await page.reload(); await page.locator('#task-list .empty').waitFor();
 await page.setViewportSize({width:390,height:844}); assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
 const host = await context.newPage();
 await host.goto('http://localhost:4173');
 await host.locator('#cpu').filter({hasText:'37%'}).waitFor();
 assert.equal(await host.locator('#memory').innerText(),'50%'); assert.equal(await host.locator('#storage').innerText(),'50%');
 assert.equal(await host.locator('#battery').innerText(),'68%');assert.match(await host.locator('#battery-detail').innerText(),/68%.*ON BATTERY/); assert.equal(await host.locator('#uptime').innerText(),'2H 3M');
 for (const viewport of [{width:1280,height:800},{width:1440,height:900},{width:1512,height:982}]) {
  await host.setViewportSize(viewport);
  assert(await host.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),'MacBook width must not overflow');
  const tasks=await host.locator('.tasks').boundingBox();const system=await host.locator('.system').boundingBox();const core=await host.locator('.core').boundingBox();
  assert(system.x+system.width<=core.x+2,'System must sit left of the moon');assert(tasks.x>=core.x+core.width-2,'Tasks must sit right of the moon');
  assert(await host.locator('#microphone').isVisible());
 }
 assert.equal(await host.locator('#ollama-status').innerText(),'ONLINE');
 await host.evaluate(()=>{window.jarvis.assistantHealth=async()=>({available:false,installed:false,model:'llama3.1:8b',voice:'bm_george'});document.dispatchEvent(new Event('visibilitychange'));});await host.locator('#ollama-status').filter({hasText:'OFFLINE'}).waitFor();
 await host.evaluate(()=>{window.jarvis.assistantHealth=async()=>({available:true,installed:false,model:'llama3.1:8b',voice:'bm_george'});const original=window.jarvis.metrics;window.jarvis.metrics=async()=>({...await original(),memoryUsed:null});document.dispatchEvent(new Event('visibilitychange'));});
 await host.locator('#ollama-status').filter({hasText:'MODEL MISSING'}).waitFor();await host.locator('#memory').filter({hasText:'—'}).waitFor();assert.equal(await host.locator('#memory-detail').innerText(),'UNAVAILABLE');
 await host.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await host.locator('.arc-outer,.arc-inner,.orbit,.scanner').count(),0);assert.equal(await host.locator('.moon-core__lettering').innerText(),'J A R V I S');
 assert.equal(await host.locator('.moon-core__lettering').evaluate(el=>getComputedStyle(el).transform),'none');
 const denied = await context.newPage();
 await denied.addInitScript(()=>{ navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');}; });
 await denied.goto('http://localhost:4173'); await denied.locator('#microphone').click();
 await denied.locator('#assistant-message').filter({hasText:'MICROPHONE PERMISSION REQUIRED'}).waitFor();
 assert.equal(await denied.locator('#core-status').innerText(),'ERROR');
 assert.deepEqual(errors,[]); console.log('PASS: task add/complete/reload/delete, clock tick, simulated microphone enable/disable, V2 moon state/action wiring, History navigation, responsive MacBook/mobile layouts, telemetry rendering, missing-key startup, full mocked voice turn, continuous silence/send/resume, immediate playback interruption, echo prevention, permission failure, reduced motion, no renderer errors');
 } finally { await browser.close(); fs.rmSync(fixtureDir,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
