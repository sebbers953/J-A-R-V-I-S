const {test}=require('node:test');const assert=require('node:assert/strict');
const {assistantHealth}=require('../dist/electron/electron/health.js');
test('Ollama indicator reads only local tags, with no credentials, inference, model loading or audio',async()=>{
 let called=0;
 const health=await assistantHealth('llama3.1:8b','bm_george',async request=>{called++;assert.equal(request.url,'http://127.0.0.1:11434/api/tags');assert.equal(request.method,'GET');assert.equal(request.redirect,'error');assert.equal(request.headers.get('authorization'),null);assert.equal(await request.text(),'');return Response.json({models:[{name:'llama3.1:8b'}]});});
 assert.deepEqual(health,{available:true,installed:true,model:'llama3.1:8b',voice:'bm_george'});assert.equal(called,1);
 assert.equal((await assistantHealth('llama3.1','bm_lewis',async()=>Response.json({models:[{name:'llama3.1:latest'}]}))).installed,true);
});
test('stopped daemon, missing model, malformed/oversized responses and unsafe configuration never report fake online status',async()=>{
 for(const request of [async()=>{throw new Error('PRIVATE_ERROR');},async()=>new Response('no',{status:500}),async()=>Response.json({}),async()=>new Response('malformed'),async()=>new Response('x'.repeat(262145))]){
  const status=await assistantHealth('llama3.1:8b','not-a-voice',request);assert.equal(status.available,false);assert.equal(status.installed,false);assert.equal(status.voice,null);assert(!JSON.stringify(status).includes('PRIVATE_ERROR'));
 }
 assert.deepEqual(await assistantHealth('llama3.1:8b',undefined,async()=>Response.json({models:[]})),{available:true,installed:false,model:'llama3.1:8b',voice:null});
 let calls=0;for(const model of ['https://example.com','gpt:cloud','sk-PLACEHOLDER_ONLY','xai-PLACEHOLDER_ONLY']){const status=await assistantHealth(model,undefined,async()=>{calls++;return Response.json({models:[]});});assert.equal(status.model,null);}assert.equal(calls,0);
});
