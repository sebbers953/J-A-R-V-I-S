const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {homeConfig,HomeAssistant,localRest}=require('../dist/electron/electron/network/home-assistant.js');
const {CredentialStore}=require('../dist/electron/electron/network/credentials.js');
const token='LOCAL_TEST_PLACEHOLDER_ONLY';const config=()=>({url:'http://127.0.0.1:8123',token,lights:[{id:'light.desk',name:'Desk lights'}]});const signal=()=>new AbortController().signal;
test('Home Assistant configuration accepts explicit lights only, local destinations and protected transport',()=>{
 assert.equal(homeConfig(config()).lights[0].id,'light.desk');assert.equal(homeConfig({...config(),url:'https://homeassistant.local:8123'}).url,'https://homeassistant.local:8123');
 for(const url of ['https://example.com','http://192.168.1.5:8123','https://8.8.8.8','file:///etc/passwd','http://user:pass@127.0.0.1','http://127.0.0.1/path','http://127.0.0.1?token=example'])assert.throws(()=>homeConfig({...config(),url}));
 for(const id of ['switch.heater','lock.front','camera.room','light.bad/path'])assert.throws(()=>homeConfig({...config(),lights:[{id,name:'Unsafe'}]}));
 assert.throws(()=>homeConfig({...config(),token:'bad\nheader'}));assert.throws(()=>homeConfig({...config(),lights:[{id:'light.a',name:'Same'},{id:'light.b',name:'Same'}]}));
});
test('smart control requires fresh state readback; HTTP success alone is insufficient, and disabled/stale configuration never executes',async()=>{
 let state='off';const calls=[];const rest=async(_config,path,method,body)=>{calls.push({path,method,body});if(method==='POST'){state='on';return [];}return {entity_id:'light.desk',state};};const home=new HomeAssistant(rest);
 assert.equal(home.snapshot().enabled,false);await assert.rejects(()=>home.refresh(signal()));home.enable(config());const revision=home.revision;
 assert.match(await home.change('light.desk',true,revision,signal()),/verified/);assert.deepEqual(calls.map(c=>c.method),['GET','POST','GET']);assert.equal(calls[1].path,'/api/services/light/turn_on');assert.deepEqual(calls[1].body,{entity_id:'light.desk'});
 assert.equal(home.snapshot(Date.now()+46000).lights[0].state,'unknown');home.disable();await assert.rejects(()=>home.change('light.desk',false,revision,signal()));assert.equal(calls.length,3);
 const unverified=new HomeAssistant(async(_c,_p,method)=>method==='POST'?[]:{entity_id:'light.desk',state:'off'});unverified.enable(config());await assert.rejects(()=>unverified.change('light.desk',true,unverified.revision,signal()),/could not be verified/);assert.equal(unverified.snapshot().lights[0].state,'unknown');unverified.disable();
});
test('already desired state makes no POST; wrong entity, unavailable, raw provider errors and cancellation do not claim success',async()=>{
 let posts=0;const home=new HomeAssistant(async(_c,_p,method)=>{if(method==='POST')posts++;return {entity_id:'light.desk',state:'on'};});home.enable(config());assert.match(await home.change('light.desk',true,home.revision,signal()),/No service call/);assert.equal(posts,0);home.disable();
 for(const response of [{entity_id:'light.other',state:'on'},{entity_id:'light.desk',state:'unavailable'}]){const client=new HomeAssistant(async()=>response);client.enable(config());await assert.rejects(()=>client.change('light.desk',true,client.revision,signal()));client.disable();}
 const client=new HomeAssistant(async()=>{throw new Error('PRIVATE_CREDENTIAL_ERROR');});client.enable(config());await assert.rejects(()=>client.refresh(signal()),error=>!error.message.includes('PRIVATE_CREDENTIAL_ERROR'));client.disable();
 const cancelled=new AbortController();cancelled.abort();home.enable(config());await assert.rejects(()=>home.change('light.desk',false,home.revision,cancelled.signal));home.disable();
});
test('real loopback Home Assistant HTTP wire uses exact supported routes and credential-free returned state',async()=>{
 const requests=[];let state='off';const server=http.createServer((req,res)=>{let body='';req.on('data',part=>body+=part);req.on('end',()=>{requests.push({path:req.url,authorization:req.headers.authorization,body});if(req.method==='POST')state='on';res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.method==='POST'?[]:{entity_id:'light.desk',state}));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const home=new HomeAssistant(localRest);
 try{home.enable({...config(),url:`http://127.0.0.1:${server.address().port}`});assert.match(await home.change('light.desk',true,home.revision,signal()),/verified/);assert.deepEqual(requests.map(r=>r.path),['/api/states/light.desk','/api/services/light/turn_on','/api/states/light.desk']);assert(requests.every(r=>r.authorization===`Bearer ${token}`));assert(!JSON.stringify(home.snapshot()).includes(token));}finally{home.disable();await new Promise(resolve=>server.close(resolve));}
});
test('credential store refuses unavailable/plaintext OS storage; encrypted file stays outside source, mode 600, never returned in metadata',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-credentials-'));const file=path.join(directory,'home-assistant.enc');
 const encryption={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'test_encrypted',encryptString:text=>Buffer.from(text).map(value=>value^85),decryptString:bytes=>Buffer.from(bytes).map(value=>value^85).toString()};
 try{const store=new CredentialStore(file,encryption);await store.save(config());assert(!(await fs.readFile(file)).includes(Buffer.from(token)));assert.equal((await fs.stat(file)).mode&0o777,0o600);assert.equal((await store.load()).token,token);await store.remove();assert.equal(await store.exists(),false);
  await assert.rejects(()=>new CredentialStore(file,{...encryption,isEncryptionAvailable:()=>false}).save(config()));if(process.platform==='linux')await assert.rejects(()=>new CredentialStore(file,{...encryption,getSelectedStorageBackend:()=> 'basic_text'}).save(config()));
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('redirects do not forward credentials and a cancelled integration enable cannot activate requests',async()=>{
 let requests=0;const server=http.createServer((_req,res)=>{requests++;res.writeHead(302,{Location:'https://example.com'});res.end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const home=new HomeAssistant();try{home.enable({...config(),url:`http://127.0.0.1:${server.address().port}`});await assert.rejects(()=>home.refresh(signal()));assert.equal(requests,1);assert.equal(home.snapshot().lights[0].state,'unknown');}finally{home.disable();await new Promise(resolve=>server.close(resolve));}
});
