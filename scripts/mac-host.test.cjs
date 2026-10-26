const {test}=require('node:test');const assert=require('node:assert/strict');
const child=require('node:child_process');const {promisify}=require('node:util');
// Exercise real adapter construction and exact executable/argv/env via a fake OS.
// This does not claim native macOS permission or application behavior was tested.
test('Mac adapter uses fixed commands, confirms observed app/media state and hides inherited secrets',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(process,'platform');const original=child.execFile;const saved=process.env.GROK_API_KEY;process.env.GROK_API_KEY='TEST_PLACEHOLDER_ONLY';
 const calls=[];let running='true',state='paused',fail=false;
 const fake=()=>{};
 fake[promisify.custom]=async(binary,args,options)=>{
  calls.push({binary,args,options});if(fail)throw new Error('PRIVATE_OS_ERROR');
  return {stdout:args.some(a=>a.includes('is running'))?running:args.some(a=>a.includes('player state'))?state:''};
 };
 child.execFile=fake;Object.defineProperty(process,'platform',{value:'darwin'});
 const modulePath=require.resolve('../dist/electron/electron/mac-host.js');delete require.cache[modulePath];
 try{
  const {macHost}=require(modulePath);const opened=[];const host=macHost(async()=>[],async url=>opened.push(url));const signal=new AbortController().signal;
  assert.match(await host.openApp('safari',signal),/is running/);assert.deepEqual(calls[0].args,['-b','com.apple.Safari']);
  assert.match(await host.media('pause',signal),/paused/);state='playing';assert.match(await host.media('play',signal),/playing/);
  assert.match(await host.openURL('https://example.com'),/not been verified/);assert.deepEqual(opened,['https://example.com']);
  await host.shortcut('Reviewed workflow',signal);assert.deepEqual(calls.at(-1).args,['run','Reviewed workflow']);
  for(const call of calls){assert.equal(call.options.shell,undefined);assert.equal(call.options.env.GROK_API_KEY,undefined);assert(call.options.timeout>0);}
  running='false';await assert.rejects(()=>host.openApp('safari',signal));await assert.rejects(()=>host.media('play',signal));
  fail=true;await assert.rejects(()=>host.shortcut('Reviewed workflow',signal));
 }finally{child.execFile=original;Object.defineProperty(process,'platform',descriptor);if(saved===undefined)delete process.env.GROK_API_KEY;else process.env.GROK_API_KEY=saved;delete require.cache[modulePath];}
});
