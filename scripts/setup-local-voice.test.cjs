const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
test('model setup verifies downloads, reuses verified files, and removes invalid partial files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-setup-test-'));const previous=process.env.JARVIS_SPEECH_DIR;
 try{
  process.env.JARVIS_SPEECH_DIR=dir;const {download}=require('./setup-local-voice.cjs');await fs.mkdir(path.join(dir,'models'));
  const content=Buffer.from('model download verification fixture');const model={file:'test-model.bin',url:'https://example.invalid/model',algorithm:'sha256',digest:crypto.createHash('sha256').update(content).digest('hex')};
  let calls=0;const transfer=async(_url,dest)=>{calls++;await fs.writeFile(dest,content);};await download(model,transfer);await download(model,transfer);assert.equal(calls,1);assert.deepEqual(await fs.readFile(path.join(dir,'models',model.file)),content);
  await fs.rm(path.join(dir,'models',model.file));await assert.rejects(()=>download(model,async(_url,dest)=>fs.writeFile(dest,'corrupt')),/Checksum verification failed/);await assert.rejects(()=>fs.access(path.join(dir,'models',model.file)));await assert.rejects(()=>fs.access(path.join(dir,'models',model.file+'.part')));
 }finally{if(previous===undefined)delete process.env.JARVIS_SPEECH_DIR;else process.env.JARVIS_SPEECH_DIR=previous;await fs.rm(dir,{recursive:true,force:true});}
});
