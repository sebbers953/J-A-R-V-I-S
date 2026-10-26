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
for(let i=0;i<count;i++) wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/rate)*24000),44+i*2);
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
  window.jarvis={assistantStatus:async()=>({configured:true}),assistantCancel:async()=>{},assistantTurn:async()=>{await new Promise(r=>setTimeout(r,350));return {ok:true,user:'Hello Jarvis',text:'Hello Seb.',audio:voice};},
   metrics:async()=>({platform:'darwin',hostname:'Test Mac',cpu:37,memoryUsed:8*1024**3,memoryTotal:16*1024**3,storageUsed:250*1024**3,storageTotal:500*1024**3,uptime:7380,battery:68,charging:false}),loadTasks:async()=>JSON.parse(localStorage.getItem('jarvis-tasks')||'[]'),saveTasks:async tasks=>localStorage.setItem('jarvis-tasks',JSON.stringify(tasks)),fullscreen:async()=>{}};
 },{voice:wav.toString('base64')});
 await page.reload();await page.locator('#task-status').filter({hasText:'Saved on this device'}).waitFor();
 await page.locator('#task-input').fill('Run system diagnostics'); await page.locator('#task-form button').click();
 await page.getByLabel('Complete Run system diagnostics').check();
 await page.reload(); await page.getByLabel('Complete Run system diagnostics').waitFor(); assert(await page.getByLabel('Complete Run system diagnostics').isChecked());
 assert.match(await page.locator('#completion').innerText(),/100%/);
 const first = await page.locator('#clock').innerText(); await page.waitForTimeout(1100); assert.notEqual(await page.locator('#clock').innerText(),first);
 await page.locator('#microphone').click(); await page.locator('#mic-status').filter({hasText:'LISTENING'}).waitFor();
 await page.waitForTimeout(1200);
 assert(await page.locator('#waveform').evaluate(canvas => { const ctx=canvas.getContext('2d'); const w=canvas.width,h=canvas.height; const data=ctx.getImageData(0,0,w,Math.max(1,Math.floor(h/2)-3)).data; return data.some((v,i)=>i%4===3 && v>0); }), 'Waveform must show real simulated input, not a flat baseline');
 await page.screenshot({path:'/workspace/jarvis-hud.png',fullPage:true});
 await page.locator('#microphone').click(); assert.equal(await page.locator('#mic-status').innerText(),'MUTED');
 await page.locator('#microphone').click();await page.locator('#mic-status').filter({hasText:'LISTENING'}).waitFor();await page.waitForTimeout(600);
 await page.locator('#send-voice').click();await page.locator('#core-status').filter({hasText:'THINKING'}).waitFor();
 assert(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),'No capture may continue while thinking');
 await page.locator('#core-status').filter({hasText:'SPEAKING'}).waitFor();assert(await page.locator('#send-voice').isDisabled());
 assert.match(await page.locator('#conversation').innerText(),/USER: Hello Jarvis/);assert.match(await page.locator('#conversation').innerText(),/JARVIS: Hello Seb/);
 assert(await page.evaluate(()=>window.testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),'Playback must never capture its own output');
 await page.locator('#core-status').filter({hasText:'IDLE'}).waitFor();
 await page.locator('#microphone').click();await page.locator('#mic-status').filter({hasText:'LISTENING'}).waitFor();await page.waitForTimeout(350);
 await page.locator('#send-voice').click();await page.locator('#core-status').filter({hasText:'THINKING'}).waitFor();await page.locator('#microphone').click();
 await page.waitForTimeout(600);assert.equal(await page.locator('#core-status').innerText(),'MUTED','Late reply must not override cancellation');
 await page.evaluate(()=>{window.jarvis.assistantTurn=async()=>({ok:false,message:'Connection or API unavailable. Please try again.'});});
 await page.locator('#microphone').click();await page.locator('#mic-status').filter({hasText:'LISTENING'}).waitFor();await page.waitForTimeout(350);await page.locator('#send-voice').click();
 await page.locator('#assistant-message').filter({hasText:'Connection or API unavailable'}).waitFor();assert.equal(await page.locator('#core-status').innerText(),'IDLE');
 await page.getByLabel('Delete Run system diagnostics').click(); await page.reload(); await page.locator('.empty').waitFor();
 await page.setViewportSize({width:390,height:844}); assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
 const host = await context.newPage();
 await host.goto('http://localhost:4173');
 await host.locator('#cpu').filter({hasText:'37%'}).waitFor();
 assert.equal(await host.locator('#memory').innerText(),'50%'); assert.equal(await host.locator('#storage').innerText(),'50%');
 assert.match(await host.locator('#battery').innerText(),/68%.*ON BATTERY/); assert.equal(await host.locator('#uptime').innerText(),'2H 3M');
 for (const viewport of [{width:1280,height:800},{width:1440,height:900},{width:1512,height:982}]) {
  await host.setViewportSize(viewport);
  assert(await host.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),'MacBook width must not overflow');
  const tasks=await host.locator('.tasks').boundingBox(); const system=await host.locator('.system').boundingBox();
  assert(system.y>tasks.y+tasks.height,'System panel must sit below tasks');
  assert(await host.locator('#microphone').isVisible());
 }
 await host.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await host.locator('.arc-outer').evaluate(el=>getComputedStyle(el).animationName),'none');
 const denied = await context.newPage();
 await denied.addInitScript(()=>{ navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');}; });
 await denied.goto('http://localhost:4173'); await denied.locator('#microphone').click();
 await denied.locator('#assistant-message').filter({hasText:'MICROPHONE PERMISSION REQUIRED'}).waitFor();
 assert.equal(await denied.locator('#core-status').innerText(),'IDLE');
 assert.deepEqual(errors,[]); console.log('PASS: task add/complete/reload/delete, clock tick, simulated microphone enable/disable, responsive MacBook/mobile layouts, telemetry rendering, missing-key startup, full mocked voice turn, echo prevention, permission failure, reduced motion, no renderer errors');
 } finally { await browser.close(); fs.rmSync(fixtureDir,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
