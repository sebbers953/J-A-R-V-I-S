const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {MemoryStore}=require('../dist/electron/electron/memory-store.js');
const {LocalFeatures}=require('../dist/electron/electron/local-features.js');
const {ActionRunner,parseAction,validateAction,httpsURL,readApprovedFolder}=require('../dist/electron/electron/actions.js');
const {authorized}=require('../dist/electron/electron/authorization.js');
const {Assistant}=require('../dist/electron/electron/assistant.js');
const signal=()=>new AbortController().signal;
function fixture(){
 const memory=new MemoryStore(':memory:');const calls=[];let tasks=[];
 const host={openApp:async app=>{calls.push(app);return `${app} is running.`;},openURL:async url=>{calls.push(url);return 'Handed to default browser; loading not verified.';},media:async op=>{calls.push(op);return op;},shortcut:async name=>{calls.push(name);return 'Shortcut reported success.';},tasks:async update=>{if(update)tasks=update(tasks);return tasks;}};
 const actions=new ActionRunner(host);const features=new LocalFeatures(memory,actions,{chooseFolder:async()=>null,exportMemory:async data=>{calls.push(JSON.parse(data));return true;}});
 return {memory,actions,features,calls};
}
test('explicit voice memory commands, exact forgetting with confirmation, projects and no automatic saves',async()=>{
 const {memory,features}=fixture();try{
  assert.equal(await features.voice('Hello there',signal()),null);assert.equal(memory.list().length,0);
  await features.voice('Remember project: Build my trading journal',signal());assert.equal(memory.list()[0].kind,'project');
  assert.match((await features.voice('What were we working on last time?',signal())).text,/Build my trading journal/);
  assert.match((await features.voice('What do you remember about trading?',signal())).text,/Build my trading journal/);
  assert.match((await features.voice('What do you remember about skiing?',signal())).text,/No matching/);
  const forget=await features.voice('Forget that Build my trading journal',signal());assert(forget.proposal);assert.equal(memory.list().length,1);
  await features.control({kind:'confirm',id:forget.proposal.id,approved:true},signal());assert.equal(memory.list().length,0);
  await features.voice('Disable memory',signal());await features.voice('Remember that I like cyan',signal());assert.equal(memory.list().length,0);
  assert.match((await features.voice('Remember that my password is EXAMPLE_ONLY',signal())).text,/refused/);
 }finally{memory.close();}
});
test('external actions require exact expiring single-use confirmation; cancellation and provider failure are honest',async()=>{
 const {memory,features,calls,actions}=fixture();try{
  const first=await features.voice('Jarvis, open Activity Monitor.',signal());assert(first.proposal);assert.deepEqual(calls,[]);
  assert.equal((await features.control({kind:'confirm',id:first.proposal.id,approved:true},signal())).ok,true);assert.deepEqual(calls,['activity monitor']);
  assert.equal((await features.control({kind:'confirm',id:first.proposal.id,approved:true},signal())).ok,false);assert.equal(calls.length,1);
  const second=await features.voice('Open Safari',signal());features.cancel();assert.equal((await features.control({kind:'confirm',id:second.proposal.id,approved:true},signal())).ok,false);
  const third=await features.voice('Open Safari',signal());const original=Date.now;Date.now=()=>original()+61000;try{assert.equal((await features.control({kind:'confirm',id:third.proposal.id,approved:true},signal())).ok,false);}finally{Date.now=original;}
  const fourth=await features.voice('Open Safari',signal());await features.control({kind:'confirm',id:fourth.proposal.id,approved:false},signal());assert.equal(calls.length,1);
  const shortcut=await features.control({kind:'action',action:{kind:'shortcut',name:'Reviewed workflow'}},signal());const denied=await features.control({kind:'confirm',id:shortcut.proposal.id,approved:true},signal());assert.equal(denied.ok,false);assert.match(denied.text,/not approved/);
  actions.shortcuts.add('Reviewed workflow');const run=await features.control({kind:'action',action:{kind:'shortcut',name:'Reviewed workflow'}},signal());assert.equal(calls.length,1);await features.control({kind:'confirm',id:run.proposal.id,approved:true},signal());assert.equal(calls[1],'Reviewed workflow');
  assert.match((await features.voice('Run rm -rf /',signal())).text,/unsupported/);assert.equal(calls.length,2);
 }finally{memory.close();}
});
test('typed actions reject injection, unapproved apps, unsafe URLs and malformed IPC',async()=>{
 for(const action of [null,{kind:'shell',command:'echo test'},{kind:'open-app',app:'Safari; echo test'},{kind:'open-app',app:'__proto__'},{kind:'shortcut',name:'-bad'},{kind:'shortcut',name:'run\ncode'},{kind:'media',operation:'delete'}])assert.throws(()=>validateAction(action));
 for(const url of ['http://example.com','file:///etc/passwd','https://user:pass@example.com','https://localhost','https://127.0.0.1','https://host.local','https://example.com:9999','javascript:alert(1)'])assert.throws(()=>httpsURL(url));
 assert.equal(httpsURL('https://example.com/path'),'https://example.com/path');assert.equal(parseAction('open Activity Monitor').kind,'open-app');assert.equal(parseAction('Could you explain how to open Safari?'),null);
 const {memory,features}=fixture();try{for(const q of [null,{}, {kind:'memory-enabled',enabled:'true'}, {kind:'action',action:{kind:'shell'}}, {kind:'confirm',approved:true}])assert.equal((await features.control(q,signal())).ok,false);}finally{memory.close();}
 const contents={mainFrame:{}};const window={webContents:contents};assert(authorized({sender:contents,senderFrame:contents.mainFrame},window));
 for(const event of [{sender:{},senderFrame:contents.mainFrame},{sender:contents,senderFrame:{}},{sender:contents,senderFrame:null}])assert(!authorized(event,window));assert(!authorized({sender:contents,senderFrame:contents.mainFrame},null));
});
test('local task creation, listing and completion persist via host; ambiguous titles denied',async()=>{
 const {memory,features}=fixture();try{
  assert.match((await features.voice('Create a task to review my trading journal',signal())).text,/Created task/);
  assert.match((await features.voice('What tasks do I have today?',signal())).text,/Pending: review my trading journal/);
  assert.match((await features.voice('Complete task review my trading journal',signal())).text,/Completed/);
  assert.match((await features.voice('Complete task missing',signal())).text,/not found/);
  assert.match((await features.voice('What is the date and time?',signal())).text,/\d/);
 }finally{memory.close();}
});
test('file access requires approved canonical folders, denies traversal, links, credentials and excessive sizes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-files-'));const root=path.join(dir,'approved');await fs.mkdir(root);
 try{
  await fs.writeFile(path.join(root,'notes.txt'),'My journal\nKeep improving.');await fs.writeFile(path.join(dir,'outside.txt'),'outside');
  await fs.symlink(path.join(dir,'outside.txt'),path.join(root,'link.txt'));await fs.writeFile(path.join(root,'.env'),'EXAMPLE_ONLY');
  await fs.writeFile(path.join(root,'bad.txt'),'password: EXAMPLE_ONLY');await fs.writeFile(path.join(root,'large.txt'),'x'.repeat(16001));
  assert.match(await readApprovedFolder(root,'notes.txt'),/Keep improving/);assert(!((await readApprovedFolder(root)).includes('.env')));assert(!((await readApprovedFolder(root)).includes('link.txt')));
  for(const file of ['../outside.txt','/etc/passwd','link.txt','.env','bad.txt','large.txt'])await assert.rejects(()=>readApprovedFolder(root,file));
  const {memory,actions}=fixture();try{
   await assert.rejects(()=>actions.execute({kind:'files',folder:'unapproved',path:'notes.txt'},signal()));
   actions.folders.set('one',{name:'Journal',path:root});assert.match(await actions.execute({kind:'files',folder:'one',path:'notes.txt'},signal()),/Keep improving/);
   actions.folders.clear();await assert.rejects(()=>actions.execute({kind:'files',folder:'one',path:'notes.txt'},signal()));
  }finally{memory.close();}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('assistant routes local commands without Ollama, retrieves only relevant notes, clears recalled context after forgetting',async()=>{
 const {memory,features}=fixture();let input='Remember that my journal uses blue headings';const calls=[];
 const client={transcribe:async()=>input,respond:async(history,personality)=>{calls.push({history,personality});return 'A short response.';},speak:async()=>new Uint8Array(100)};
 const a=new Assistant({},client,features);const payload={audio:new Uint8Array(100),mime:'audio/wav'};
 try{
  assert((await a.turn(payload)).ok);assert.equal(calls.length,0);assert.equal(memory.list().length,1);
  input='Explain my journal style';await a.turn(payload);assert.match(calls[0].personality,/blue headings/);
  input='Tell me about astronomy';await a.turn(payload);assert(!calls[1].personality.includes('blue headings'));assert.equal(calls[1].history.length,3);
  await features.control({kind:'memory-enabled',enabled:false},signal());input='Explain my journal style';await a.turn(payload);assert(!calls[2].personality.includes('blue headings'));assert.equal(calls[2].history.length,1);
  input='Open Safari';const proposed=await a.turn(payload);assert(proposed.ok&&proposed.proposal);assert.equal(calls.length,3);
 }finally{memory.close();}
});
test('failed storage cannot cause false memory/action promises and aborted controls do not grant access',async()=>{
 const {unavailableFeatures}=require('../dist/electron/electron/local-features.js');
 assert((await unavailableFeatures.voice('Remember that I prefer cyan',signal())).error);assert((await unavailableFeatures.voice('Open Safari',signal())).error);assert.equal(await unavailableFeatures.voice('Tell me about astronomy',signal()),null);
 const {memory,actions}=fixture();const controller=new AbortController();
 const features=new LocalFeatures(memory,actions,{chooseFolder:async()=>{controller.abort();return {id:'one',name:'Journal',path:'/tmp/approved'};},exportMemory:async()=>false});
 try{assert.equal((await features.control({kind:'folder-approve'},controller.signal)).ok,false);assert.equal(actions.folders.size,0);}finally{memory.close();}
});
test('polite explicit commands route locally; unsupported memory syntax never becomes a model promise',async()=>{
 const {memory,features,calls}=fixture();try{
  await features.voice('Could you please remember that I prefer quiet mornings?',signal());assert.equal(memory.list()[0].text,'I prefer quiet mornings');
  const proposed=await features.voice('Please open Safari.',signal());assert(proposed.proposal);assert.deepEqual(calls,[]);
  const denied=await features.voice('Remember my whole life',signal());assert(denied.error);assert.match(denied.text,/Nothing was saved/);assert.equal(memory.list().length,1);
 }finally{memory.close();}
});
