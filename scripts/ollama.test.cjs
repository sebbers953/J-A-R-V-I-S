const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {OllamaProviders,OLLAMA_MODEL}=require('../dist/electron/electron/providers.js');
const {failureMessage}=require('../dist/electron/electron/diagnostics.js');
const show=()=>({details:{format:'gguf'},model_info:{'general.architecture':'llama'},capabilities:['completion']});
const reply=()=>({message:{role:'assistant',content:'Ready.'},done:true});
test('default model is Llama 3.1 8B for the confirmed M4/24GB; preserves bounded session messages',async()=>{
 const requests=[];const fetch=async req=>{requests.push(req);return Response.json(req.url.endsWith('/show')?show():reply());};
 const provider=new OllamaProviders({},fetch,{});const history=[{role:'user',content:'My name is Seb'},{role:'assistant',content:'Hello Seb.'},{role:'user',content:'What is my name?'}];
 assert.equal(await provider.respond(history,'Personality',new AbortController().signal),'Ready.');
 const body=await requests[1].json();assert.equal(OLLAMA_MODEL,'llama3.1:8b');assert.deepEqual(body.messages,[{role:'system',content:'Personality'},...history]);assert.equal(body.options.num_ctx,4096);assert.equal(body.options.num_predict,512);assert.equal(body.keep_alive,'5m');assert.equal(body.tools,undefined);
});
test('cloud tags, URLs and remote aliases are rejected before inference',async()=>{
 for(const model of ['llama3.1:cloud','gpt-oss:120b-cloud','https://ollama.com/model','ollama.com/foo:latest']){
  let calls=0;const provider=new OllamaProviders({model},async()=>{calls++;return Response.json(show());},{});
  await assert.rejects(()=>provider.respond([],'system',new AbortController().signal),e=>e.kind==='cloud_model_blocked');assert.equal(calls,0);
 }
 let calls=0;const provider=new OllamaProviders({model:'alias:latest'},async()=>{calls++;return Response.json({...show(),remote_host:'https://ollama.com',remote_model:'cloud-model'});},{});
 await assert.rejects(()=>provider.respond([],'system',new AbortController().signal),e=>e.kind==='cloud_model_blocked');assert.equal(calls,1);
});
test('model provenance is checked each turn, so a retagged alias is blocked',async()=>{
 let seen=0;const provider=new OllamaProviders({},async req=>{if(req.url.endsWith('/show'))return Response.json(++seen===1?show():{...show(),remote_host:'https://ollama.com'});return Response.json(reply());},{});
 assert.equal(await provider.respond([],'system',new AbortController().signal),'Ready.');await assert.rejects(()=>provider.respond([],'system',new AbortController().signal),e=>e.kind==='cloud_model_blocked');
});
test('stopped service, missing model, insufficient memory and malformed responses have safe errors',async()=>{
 const cases=[{mock:async()=>{throw new TypeError('PRIVATE')},kind:'ollama_unavailable'}, {mock:async()=>Response.json({error:'PRIVATE'},{status:404}),kind:'model_unavailable'}, {mock:async()=>Response.json({error:'requires more memory PRIVATE'},{status:500}),kind:'insufficient_memory'}, {mock:async()=>Response.json({}),kind:'invalid_response'}];
 for(const {mock,kind} of cases){const p=new OllamaProviders({},mock,{});let caught;try{await p.respond([],'system',new AbortController().signal);}catch(e){caught=e;}assert.equal(caught.kind,kind);assert(!failureMessage('response',caught).includes('PRIVATE'));}
});
test('real loopback HTTP wire integration validates show/chat, without external services or credentials',async()=>{
 const seen=[];const server=http.createServer((req,res)=>{let data='';req.on('data',b=>data+=b);req.on('end',()=>{seen.push({path:req.url,headers:req.headers,body:JSON.parse(data)});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/api/show'?show():reply()));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 try{
  const transport=req=>{assert.equal(new URL(req.url).hostname,'127.0.0.1');return fetch(new Request(`http://127.0.0.1:${port}${new URL(req.url).pathname}`,req));};
  assert.equal(await new OllamaProviders({},transport,{}).respond([{role:'user',content:'Hello'}],'System',new AbortController().signal),'Ready.');
  assert.deepEqual(seen.map(r=>r.path),['/api/show','/api/chat']);assert.equal(seen[1].headers.authorization,undefined);assert.equal(seen[1].body.model,'llama3.1:8b');
 }finally{await new Promise(r=>server.close(r));}
});
test('cancelled work does not contact the daemon, and a wrong/incomplete response never counts as success',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;const cancelled=new OllamaProviders({},async()=>{calls++;return Response.json(show());},{});
 await assert.rejects(()=>cancelled.respond([],'System',controller.signal),e=>e.kind==='cancelled');assert.equal(calls,0);
 const malformed=new OllamaProviders({},async req=>Response.json(req.url.endsWith('/show')?show():{done:false,message:{role:'assistant',content:'Incomplete'}}),{});
 await assert.rejects(()=>malformed.respond([],'System',new AbortController().signal),e=>e.kind==='invalid_response');
});
