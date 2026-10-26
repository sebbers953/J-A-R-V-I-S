const {test}=require('node:test');const assert=require('node:assert/strict');
const {SpaceXAI}=require('@xai-official/sdk');
const {CloudProviders,GROK_MODEL}=require('../dist/electron/electron/providers.js');
const {redactGrokBody}=require('../dist/electron/electron/grok-http.js');
const {failureMessage}=require('../dist/electron/electron/diagnostics.js');
const reply=()=>Response.json({id:'r',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Ready.'}]}]});
function logs(){const lines=[];const original=console.info;console.info=(...args)=>lines.push(args.join(' '));return {lines,restore:()=>console.info=original};}
test('regression: SDK injects include for store:false; actual JARVIS wire request has only explicit text parameters',async()=>{
 const log=logs();try{
  let sdkBody;
  const sdk=new SpaceXAI({apiKey:'your_grok_key_here',fetch:async req=>{sdkBody=await req.json();return reply();},maxRetries:0});
  await sdk.responses.create({model:GROK_MODEL,input:[{role:'user',content:'Hello'}],store:false,stream:false});
  assert.deepEqual(sdkBody.include,['reasoning.encrypted_content']);
  let sent;const mock=async req=>{
   if(req.url.endsWith('/models'))return Response.json({object:'list',data:[{id:GROK_MODEL}]});
   sent=await req.json();
   assert.deepEqual(Object.keys(sent).sort(),['input','max_output_tokens','model','store','stream']);
   assert.equal(sent.include,undefined);assert.equal(sent.reasoning,undefined);
   assert.equal(req.url,'https://api.x.ai/v1/responses');assert.equal(req.method,'POST');assert.equal(req.headers.get('authorization'),'Bearer your_grok_key_here');assert.equal(req.headers.get('content-type'),'application/json');
   return reply();
  };
  const provider=new CloudProviders({grok:'your_grok_key_here'},mock,{});
  assert.equal(await provider.respond([{role:'user',content:'PRIVATE QUESTION'}],'PRIVATE PERSONALITY',new AbortController().signal),'Ready.');
  assert.equal(sent.model,GROK_MODEL);assert.equal(sent.store,false);assert.equal(sent.input[1].content,'PRIVATE QUESTION');
  const output=log.lines.join('');assert(!output.includes('PRIVATE QUESTION'));assert(!output.includes('PRIVATE PERSONALITY'));assert(!output.includes('your_grok_key_here'));assert.match(output,/grok_request/);
 }finally{log.restore();}
});
test('full original API error message/code/body survives SDK rewriting with credentials removed',async()=>{
 const log=logs();try{
  const key='your_grok_key_here';const body={error:{message:`Unsupported parameter include; reasoning is not enabled. ${key}`,code:'unsupported_parameter',param:'include',type:'invalid_request_error'},extra:{request_shape:'unchanged',api_key:key,Authorization:`Bearer ${key}`}};
  const mock=async req=>req.url.endsWith('/models')?Response.json({object:'list',data:[{id:GROK_MODEL}]}):Response.json(body,{status:400});
  const provider=new CloudProviders({grok:key},mock,{});let caught;
  try{await provider.respond([],'Hello',new AbortController().signal);}catch(error){caught=error;}
  assert(caught);assert.equal(caught.status,400);const captured=JSON.parse(caught.body);
  assert.match(captured.error.message,/Unsupported parameter include; reasoning is not enabled/);assert.equal(captured.error.code,'unsupported_parameter');assert.equal(captured.error.param,'include');assert.equal(captured.extra.request_shape,'unchanged');
  assert.equal(captured.extra.api_key,'[REDACTED]');assert(!caught.body.includes(key));assert(!log.lines.join('').includes(key));
  const visible=failureMessage('response',caught);assert.match(visible,/unsupported_parameter/);assert.match(visible,/Unsupported parameter/);assert(!visible.includes(key));assert.match(log.lines.join(''),/grok_http_error/);
 }finally{log.restore();}
});
test('JSON and plain-text credential redaction preserves diagnostic fields and hides encoded keys',()=>{
 const secret='placeholder/private+test-key';
 const raw=JSON.stringify({error:{code:'bad_request',message:`literal ${secret} encoded ${encodeURIComponent(secret)}`},token:'non-sensitive-label',nested:{refresh_token:'private'}});
 const safe=redactGrokBody(raw,[secret]);assert(!safe.includes(secret));assert(!safe.includes(encodeURIComponent(secret)));assert.match(safe,/bad_request/);assert(!safe.includes('"refresh_token":"private"'));
 assert(!redactGrokBody(`Bearer ${secret}`,[secret]).includes(secret));
});
test('catalog HTTP 400 preserves the original body and code rather than becoming an SDK connection error',async()=>{
 const log=logs();try{
  const provider=new CloudProviders({grok:'your_grok_key_here'},async()=>Response.json({error:'Catalog request rejected',code:'catalog_access_error'},{status:400}),{});
  let caught;try{await provider.respond([],'Hello',new AbortController().signal);}catch(error){caught=error;}
  assert(caught);assert.equal(caught.status,400);assert.equal(caught.operation,'catalog');assert.match(failureMessage('response',caught),/catalog_access_error/);assert.match(failureMessage('response',caught),/Grok model catalog/);
 }finally{log.restore();}
});
