const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Assistant,PERSONALITY}=require('../dist/electron/electron/assistant.js');
const {CloudProviders,GROK_MODEL,FISH_MODEL,FISH_ASR_MODEL}=require('../dist/electron/electron/providers.js');
const {decode}=require('@msgpack/msgpack');
const {encodeWav}=require('../dist/electron/audio-wav.js');
const {nextState}=require('../dist/electron/assistant-state.js');
const payload={audio:encodeWav([new Float32Array(500)],48000),mime:'audio/wav'};
function fixture(overrides={}) {
 const calls=[];
 const client={transcribe:async()=> 'Hello Jarvis',respond:async(history,personality)=>{calls.push(['response',{history,personality}]);return 'Hello Seb.';},speak:async text=>{calls.push(['speech',text]);return new Uint8Array([1,2,3]);}};
 Object.assign(client,overrides);return {client,calls};
}
test('assistant transitions enforce capture -> processing -> playback and prevent recapture',()=>{
 let s='IDLE';for(const [event,expected] of [['start','LISTENING'],['submit','THINKING'],['start','THINKING'],['reply','SPEAKING'],['start','SPEAKING'],['finish','IDLE'],['start','LISTENING'],['mute','MUTED'],['start','LISTENING'],['error','IDLE']]){s=nextState(s,event);assert.equal(s,expected);}
});
test('missing either provider key or placeholder keys require configuration without network calls',async()=>{
 for(const keys of [{},{grok:'your_grok_key_here'},{fish:'your_fish_audio_key_here'},{grok:'your_key_here',fish:'your_key_here'},{grok:'',fish:''}]){const a=new Assistant(keys);assert.equal(a.configured(),false);assert.deepEqual(await a.turn(payload),{ok:false,message:'CONFIGURATION REQUIRED'});}
});
test('session history and personality preserved; speech uses the exact Grok response',async()=>{
 const {client,calls}=fixture();const a=new Assistant({},client);const first=await a.turn(payload);assert.equal(first.ok,true);assert.equal(first.text,'Hello Seb.');assert.equal(first.user,'Hello Jarvis');
 await a.turn(payload);const requests=calls.filter(c=>c[0]==='response');assert.equal(requests[1][1].history.length,3);assert.equal(requests[1][1].history[1].content,'Hello Seb.');assert.equal(requests[0][1].personality,PERSONALITY);assert.equal(calls.find(c=>c[0]==='speech')[1],first.text);
});
test('invalid payloads and provider errors never expose raw error text',async()=>{
 const {client}=fixture({respond:async()=>{throw {status:401,message:'DO NOT EXPOSE RAW PROVIDER DETAILS'};}});const a=new Assistant({},client);
 assert.equal((await a.turn({audio:new Uint8Array(9),mime:'text/plain'})).message,'Invalid audio input.');
 const result=await a.turn(payload);assert.equal(result.ok,false);assert.match(result.message,/authentication/);assert(!JSON.stringify(result).includes('DO NOT EXPOSE'));
 client.respond=async()=>{throw new Error('raw transport details');};assert.match((await a.turn(payload)).message,/Grok response failed/);
});
test('Fish TTS failure retains text and follow-up context; cancellation and overlap remain safe',async()=>{
 const {client,calls}=fixture({speak:async()=>{throw new Error('private details');}});const a=new Assistant({},client);const result=await a.turn(payload);assert.equal(result.ok,true);assert.equal(result.audio,null);assert.equal(result.text,'Hello Seb.');assert.match(result.warning,/Fish Audio/);
 await a.turn(payload);assert.equal(calls.filter(c=>c[0]==='response')[1][1].history[1].content,'Hello Seb.');
 client.respond=(_h,_p,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}));
 const pending=a.turn(payload);await new Promise(r=>setImmediate(r));assert.match((await a.turn(payload)).message,/already processing/);a.cancel();assert.equal((await pending).message,'Cancelled.');
});
test('official xAI SDK and Fish HTTP contracts route each stage to its provider with isolated auth',async()=>{
 const calls=[];
 const mockFetch=async(input,init)=>{
  const request=input instanceof Request?input:new Request(input,init);const url=request.url;calls.push({url,request});
  if(url==='https://api.fish.audio/v1/asr')return Response.json({text:'Hello Jarvis'});
  if(url==='https://api.fish.audio/v1/tts')return new Response(payload.audio,{headers:{'content-type':'audio/wav'}});
  if(url==='https://api.x.ai/v1/responses')return Response.json({id:'test-response',status:'completed',output:[{type:'message',id:'test-message',role:'assistant',content:[{type:'output_text',text:'Hello Seb.'}]}]});
  throw new Error('Unexpected endpoint');
 };
 // Placeholders are sent only to the in-memory mock fetch, never to a live provider.
 const providers=new CloudProviders({grok:'your_grok_key_here',fish:'your_fish_audio_key_here'},mockFetch);
 const assistant=new Assistant({},providers);assert.equal((await assistant.turn(payload)).ok,true);
 assert.deepEqual(calls.map(c=>c.url),['https://api.fish.audio/v1/asr','https://api.x.ai/v1/responses','https://api.fish.audio/v1/tts']);
 const stt=decode(new Uint8Array(await calls[0].request.arrayBuffer()));assert.deepEqual(stt.audio,payload.audio);assert.equal(stt.ignore_timestamps,true);assert.equal(stt.diarize,false);assert.equal(stt.tag_audio_events,false);assert.equal(stt.reference_id,undefined);assert.equal(calls[0].request.headers.get('model'),FISH_ASR_MODEL);assert.equal(calls[0].request.headers.get('content-type'),'application/msgpack');
 const grok=await calls[1].request.json();assert.equal(grok.model,GROK_MODEL);assert.equal(grok.input[0].content,PERSONALITY);assert.equal(grok.store,false);
 const speech=decode(new Uint8Array(await calls[2].request.arrayBuffer()));assert.equal(speech.text,'Hello Seb.');assert.equal(speech.format,'wav');assert.equal(calls[2].request.headers.get('model'),FISH_MODEL);
 assert.equal(calls[0].request.headers.get('authorization'),'Bearer your_fish_audio_key_here');assert.equal(calls[1].request.headers.get('authorization'),'Bearer your_grok_key_here');assert.equal(calls[2].request.headers.get('authorization'),'Bearer your_fish_audio_key_here');
});
test('Fish authentication failure is sanitized; empty Fish speech retains Grok text',async()=>{
 let code=401;
 const mock=async()=>new Response('',{status:code});
 const providers=new CloudProviders({grok:'your_grok_key_here',fish:'your_fish_audio_key_here'},mock);
 assert.match((await new Assistant({},providers).turn(payload)).message,/authentication/);
 code=200;await assert.rejects(()=>providers.speak('Hello',new AbortController().signal),/Provider request failed/);
});
test('WAV encoder creates valid mono PCM16, downmixes channels, and clamps samples',()=>{
 const wav=encodeWav([new Float32Array([1,-1,2]),new Float32Array([1,-1,2])],48000);const view=new DataView(wav.buffer);
 assert.equal(Buffer.from(wav.subarray(0,4)).toString(),'RIFF');assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(24,true),48000);assert.equal(view.getInt16(44,true),32767);assert.equal(view.getInt16(46,true),-32768);assert.equal(view.getInt16(48,true),32767);assert.throws(()=>encodeWav([],48000));
});

test('Fish voice configuration is captured from the environment and maps to reference_id only',async()=>{
 const previous=process.env.FISH_AUDIO_MODEL_ID;
 try {
  for(const value of [undefined,'','your_model_id_here','placeholder-test-voice']) {
   if(value===undefined)delete process.env.FISH_AUDIO_MODEL_ID;else process.env.FISH_AUDIO_MODEL_ID=value;
   let body,backend;
   const mock=async(_url,init)=>{body=decode(new Uint8Array(init.body));backend=init.headers.model;return new Response(payload.audio);};
   const providers=new CloudProviders({grok:'your_grok_key_here',fish:'your_fish_audio_key_here'},mock);
   delete process.env.FISH_AUDIO_MODEL_ID;
   await providers.speak('Hello Seb.',new AbortController().signal);
   assert.equal(body.reference_id,value==='placeholder-test-voice'?value:undefined);
   assert.equal(backend,FISH_MODEL);assert.equal(body.text,'Hello Seb.');
  }
 } finally {if(previous===undefined)delete process.env.FISH_AUDIO_MODEL_ID;else process.env.FISH_AUDIO_MODEL_ID=previous;}
});
