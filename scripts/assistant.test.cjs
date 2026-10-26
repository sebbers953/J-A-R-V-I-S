const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Assistant,PERSONALITY}=require('../dist/electron/electron/assistant.js');
const {nextState}=require('../dist/electron/assistant-state.js');
const payload={audio:new Uint8Array(500),mime:'audio/webm;codecs=opus'};
function fixture(overrides={}) {
 const calls=[];
 const client={audio:{transcriptions:{create:async()=>({text:'Hello Jarvis'})},speech:{create:async(params)=>{calls.push(['speech',params]);return {arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};}}},responses:{create:async(params)=>{calls.push(['response',params]);return {output_text:'Hello Seb.'};}}};
 Object.assign(client,overrides); return {client,calls};
}
test('assistant transitions enforce capture -> processing -> playback and prevent recapture',()=>{
 let s='IDLE'; for(const [event,expected] of [['start','LISTENING'],['submit','THINKING'],['start','THINKING'],['reply','SPEAKING'],['start','SPEAKING'],['finish','IDLE'],['start','LISTENING'],['mute','MUTED'],['start','LISTENING'],['error','IDLE']]){s=nextState(s,event);assert.equal(s,expected);}
});
test('missing and placeholder API keys require configuration without crashing or network calls',async()=>{
 for(const key of [undefined,'','your_key_here']) {const a=new Assistant(key);assert.equal(a.configured(),false);assert.deepEqual(await a.turn(payload),{ok:false,message:'CONFIGURATION REQUIRED'});}
});
test('transcription, contextual Responses API, and speech use the exact same response',async()=>{
 const {client,calls}=fixture();const a=new Assistant(undefined,client);
 const first=await a.turn(payload);assert.equal(first.ok,true);assert.equal(first.text,'Hello Seb.');assert.equal(first.user,'Hello Jarvis');
 await a.turn(payload);const requests=calls.filter(c=>c[0]==='response');
 assert.equal(requests[1][1].input.length,3);assert.equal(requests[1][1].input[1].content,'Hello Seb.');
 assert.equal(requests[0][1].instructions,PERSONALITY);assert.equal(requests[0][1].store,false);
 assert.equal(calls.find(c=>c[0]==='speech')[1].input,first.text);
});
test('invalid payloads and API errors are safely handled without leaking raw error text',async()=>{
 const {client}=fixture({responses:{create:async()=>{throw {status:401,message:'DO NOT EXPOSE RAW PROVIDER DETAILS'};}}});const a=new Assistant(undefined,client);
 assert.equal((await a.turn({audio:new Uint8Array(9),mime:'text/plain'})).message,'Invalid audio input.');
 const result=await a.turn(payload);assert.equal(result.ok,false);assert.match(result.message,/authentication/);assert(!JSON.stringify(result).includes('DO NOT EXPOSE'));
 client.responses.create=async()=>{throw new Error('raw transport details');};assert.match((await a.turn(payload)).message,/Connection or API/);
});
test('TTS failure preserves visible response; cancelled requests and overlapping turns are safe',async()=>{
 const {client}=fixture(); client.audio.speech.create=async()=>{throw new Error('private details');};
 const a=new Assistant(undefined,client);const result=await a.turn(payload);assert.equal(result.ok,true);assert.equal(result.audio,null);assert.equal(result.text,'Hello Seb.');
 client.responses.create=(_p,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}));
 const pending=a.turn(payload);await new Promise(r=>setImmediate(r));
 assert.match((await a.turn(payload)).message,/already processing/);a.cancel();assert.equal((await pending).message,'Cancelled.');
});
