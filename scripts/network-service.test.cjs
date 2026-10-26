const {test}=require('node:test');const assert=require('node:assert/strict');
const {NetworkService}=require('../dist/electron/electron/network/service.js');const {HomeAssistant}=require('../dist/electron/electron/network/home-assistant.js');
const {LocalFeatures}=require('../dist/electron/electron/local-features.js');const {MemoryStore}=require('../dist/electron/electron/memory-store.js');const {ActionRunner}=require('../dist/electron/electron/actions.js');const {Assistant}=require('../dist/electron/electron/assistant.js');
const signal=()=>new AbortController().signal;
function fixture(){
 const net={id:'selected',name:'en0',address:'192.168.4.2',netmask:'255.255.255.0'};let starts=0,posts=0,state='off';
 const discovery={selected:null,active:false,running:false,configure(id,authorized,active){if(id!==net.id||authorized!==true||typeof active!=='boolean')throw new Error('Invalid');this.selected=net;this.active=active;},start(){if(!this.running)starts++;this.running=true;return 'Session started';},stop(){this.running=false;},snapshot(){return {running:this.running,active:this.active,configured:!!this.selected,interface:this.selected,interfaces:[net],endsAt:null,devices:[],errors:[]};}};
 const home=new HomeAssistant(async(_c,_p,method)=>{if(method==='POST'){posts++;state='on';return [];}return {entity_id:'light.desk',state};});
 const config={url:'http://127.0.0.1:8123',token:'TEST_PLACEHOLDER_ONLY',lights:[{id:'light.desk',name:'Desk lights'}]};
 const network=new NetworkService(discovery,home,{exists:async()=>true,load:async()=>config,save:async()=>{},remove:async()=>{}},async()=>null);
 const memory=new MemoryStore(':memory:');const features=new LocalFeatures(memory,new ActionRunner({}),{chooseFolder:async()=>null,exportMemory:async()=>false},network);
 return {network,features,memory,home,discovery,starts:()=>starts,posts:()=>posts};
}
test('voice discovery requires configured authorization and confirmation; stop/show are honest and demo data is absent',async()=>{
 const f=fixture();try{
  assert((await f.features.voice('Jarvis, scan my local network',signal())).error);assert.equal(f.starts(),0);
  await f.features.control({kind:'network',request:{kind:'configure',interfaceId:'selected',authorized:true,active:false}},signal());const proposal=await f.features.voice('Scan my local network',signal());assert(proposal.proposal);assert.equal(f.starts(),0);
  await f.features.control({kind:'confirm',id:proposal.proposal.id,approved:true},signal());assert.equal(f.starts(),1);assert.equal(f.home.enabled,false);
  assert.equal((await f.features.voice('Show connected devices',signal())).view,'network');assert.equal(f.network.snapshot().devices.length,0);
  await f.features.voice('Stop the network scan',signal());assert.equal(f.discovery.running,false);
 }finally{f.network.close();f.memory.close();}
});
test('smart-home control is independently enabled, allowlisted and confirmed, with revision invalidation and no renderer credentials',async()=>{
 const f=fixture();try{
  assert((await f.features.voice('Turn on my desk lights',signal())).error);await f.features.control({kind:'network',request:{kind:'smart-enable',enabled:true}},signal());assert.equal(f.discovery.running,false);assert(!JSON.stringify(f.network.snapshot()).includes('TEST_PLACEHOLDER_ONLY'));
  const proposal=await f.features.voice('Turn on my desk lights',signal());assert(proposal.proposal);assert.equal(f.posts(),0);
  await f.features.control({kind:'confirm',id:proposal.proposal.id,approved:true},signal());assert.equal(f.posts(),1);
  const old=await f.features.voice('Turn off my desk lights',signal());f.home.disable();const result=await f.features.control({kind:'confirm',id:old.proposal.id,approved:true},signal());assert.equal(result.ok,false);assert.equal(f.posts(),1);
  assert((await f.features.voice('Turn on my front door lock',signal())).error);
 }finally{f.network.close();f.memory.close();}
});
test('network voice commands stay out of Ollama, and view routing metadata survives the existing speech response',async()=>{
 const f=fixture();let modelCalls=0;const client={transcribe:async()=> 'Show connected devices',respond:async()=>{modelCalls++;return 'Unsupported';},speak:async()=>new Uint8Array(100)};
 try{const result=await new Assistant({},client,f.features).turn({audio:new Uint8Array(100),mime:'audio/wav'});assert(result.ok);assert.equal(result.view,'network');assert.equal(modelCalls,0);assert(!result.text.includes('Demo'));}finally{f.network.close();f.memory.close();}
});
test('cancelling while local credentials load never enables Home Assistant',async()=>{
 const f=fixture(),controller=new AbortController();const credentials={exists:async()=>true,load:async()=>{controller.abort();return {url:'http://127.0.0.1',token:'TEST_PLACEHOLDER_ONLY',lights:[{id:'light.desk',name:'Desk lights'}]};}};
 const service=new NetworkService(f.discovery,f.home,credentials,async()=>null);
 try{await assert.rejects(()=>service.command({kind:'smart-enable',enabled:true},controller.signal,()=>{}));assert.equal(f.home.enabled,false);assert.equal(f.posts(),0);}finally{service.close();f.memory.close();}
});
