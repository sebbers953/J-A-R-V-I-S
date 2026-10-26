const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadAssistantConfig}=require('../dist/electron/electron/config.js');
const {failureInfo,failureMessage,logStage}=require('../dist/electron/electron/diagnostics.js');
const {Assistant}=require('../dist/electron/electron/assistant.js');
const {CloudProviders}=require('../dist/electron/electron/providers.js');
const {encodeWav}=require('../dist/electron/audio-wav.js');
const {decode}=require('@msgpack/msgpack');
const audio=encodeWav([new Float32Array(500)],48000);const payload={audio,mime:'audio/wav'};
function capture(){const lines=[];const original=console.info;console.info=(...args)=>lines.push(args.join(' '));return {lines,restore:()=>console.info=original};}
test('project-root .env loading trims values, reports sources only, and ignores whitespace-only exports',()=>{
 const log=capture();try{
  const env={GROK_API_KEY:'   ',FISH_AUDIO_API_KEY:'  placeholder-shell-fish  '};let file;
  const keys=loadAssistantConfig('/tmp/example-project',env,path=>{file=path;return 'GROK_API_KEY="  placeholder-file-grok  "\nFISH_AUDIO_API_KEY=placeholder-file-fish\nFISH_AUDIO_MODEL_ID=placeholder-private-voice\n';});
  assert.equal(file,'/tmp/example-project/.env');assert.equal(keys.grok,'placeholder-file-grok');assert.equal(keys.fish,'placeholder-shell-fish');assert.equal(env.FISH_AUDIO_MODEL_ID,'placeholder-private-voice');
  const output=log.lines.join('\n');assert.match(output,/env_file=loaded/);assert.match(output,/variable=GROK_API_KEY source=env-file status=present/);assert.match(output,/variable=FISH_AUDIO_API_KEY source=environment status=present/);
  for(const value of ['placeholder-file-grok','placeholder-shell-fish','placeholder-private-voice','placeholder-file-fish'])assert(!output.includes(value));
 }finally{log.restore();}
});
test('missing and unreadable configuration files are distinguished without leaking errors',()=>{
 const log=capture();try{
  for(const code of ['ENOENT','EACCES']){const env={};const keys=loadAssistantConfig('/tmp/example',env,()=>{throw Object.assign(new Error('PRIVATE RAW FILE DETAILS'),{code});});assert.equal(new Assistant(keys).configured(),false);}
  assert(log.lines.some(l=>l.includes('env_file=missing')));assert(log.lines.some(l=>l.includes('env_file=unreadable')));assert(!log.lines.join('').includes('PRIVATE RAW'));
 }finally{log.restore();}
});
test('every pipeline failure reports its exact stage while retaining text for TTS failures',async()=>{
 const log=capture();try{
  for(const stage of ['transcription','response','tts']){
   const raw={status:422,message:'PRIVATE PROVIDER BODY',headers:{Authorization:'PRIVATE AUTH'},body:{reference_id:'PRIVATE VOICE'}};
   const providers={transcribe:async()=>{if(stage==='transcription')throw raw;return 'PRIVATE USER TEXT';},respond:async()=>{if(stage==='response')throw raw;return 'PRIVATE RESPONSE TEXT';},speak:async()=>{throw raw;}};
   const result=await new Assistant({},providers).turn(payload);assert.equal(result.ok,stage==='tts');assert.match(result.ok?result.warning:result.message,/HTTP 422/);
   if(result.ok)assert.equal(result.text,'PRIVATE RESPONSE TEXT');
   assert(log.lines.some(l=>l.includes(`stage=${stage}`)&&l.includes('event=failed')&&l.includes('http_status=422')));
  }
  const output=log.lines.join('\n');for(const value of ['PRIVATE PROVIDER BODY','PRIVATE AUTH','PRIVATE VOICE','PRIVATE USER TEXT','PRIVATE RESPONSE TEXT'])assert(!output.includes(value));
 }finally{log.restore();}
});
test('only allowlisted failure metadata can reach logs; auth, access, timeout, DNS, invalid responses are actionable',()=>{
 const log=capture();try{
  for(const [error,kind] of [[{status:401},'authentication'],[{status:403},'permission'],[{status:404},'not_found'],[{status:415},'invalid_request'],[{status:429},'rate_limit'],[{status:503},'server'],[{name:'TimeoutError'},'timeout'],[{cause:{code:'ENOTFOUND'}},'network'],[{kind:'invalid_response',status:200},'invalid_response']])assert.equal(failureInfo(error).kind,kind);
  logStage(1,'response','failed',42,{status:'PRIVATE STATUS',kind:'PRIVATE KIND',name:'PRIVATE NAME',message:'PRIVATE MESSAGE',body:'PRIVATE BODY',cause:{code:'PRIVATE CODE'}});
  assert(!log.lines.join('').includes('PRIVATE'));assert.match(failureMessage('response',{status:404}),/Grok.*model/);assert.match(failureMessage('tts',{status:404}),/voice\/model/);
 }finally{log.restore();}
});
test('Fish ASR MessagePack contract is accepted by a strict mock server; multipart would be rejected',async()=>{
 const log=capture();try{
  const mock=async(input,init)=>{
   const req=input instanceof Request?input:new Request(input,init);
   if(req.url.endsWith('/asr')){
    if(req.headers.get('content-type')!=='application/msgpack')return Response.json({error:'unsupported'},{status:415});
    const body=decode(new Uint8Array(await req.arrayBuffer()));assert.deepEqual(body.audio,audio);assert.equal(body.ignore_timestamps,true);return Response.json({text:'Hello'});
   }
   if(req.url.endsWith('/responses'))return Response.json({id:'r',status:'completed',output:[{type:'message',id:'m',role:'assistant',content:[{type:'output_text',text:'Hello Seb.'}]}]});
   return new Response(audio,{headers:{'content-type':'audio/wav'}});
  };
  const result=await new Assistant({},new CloudProviders({grok:'your_grok_key_here',fish:'your_fish_audio_key_here'},mock)).turn(payload);assert.equal(result.ok,true);assert.equal(result.text,'Hello Seb.');assert(log.lines.some(l=>l.includes('stage=tts')&&l.includes('event=success')));
 }finally{log.restore();}
});
