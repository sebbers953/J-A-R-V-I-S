const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {MemoryStore,safeMemoryText}=require('../dist/electron/electron/memory-store.js');
test('SQLite memory survives restarts; parameterized text, edit, export, delete and persisted disable',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-memory-'));const file=path.join(dir,'memory.sqlite');let db=new MemoryStore(file);
 try {
  const note=db.save("Trading project: journal'); DROP TABLE memories; --",'project');
  assert.equal(fs.statSync(file).mode&0o777,0o600);db.close();db=new MemoryStore(file);
  assert.equal(db.get(note.id).text,note.text);assert.equal(db.search('Trading')[0].id,note.id);
  db.save('Trading journal review each evening','project',note.id);assert.equal(db.list().length,1);
  assert.equal(JSON.parse(db.export()).memories[0].text,'Trading journal review each evening');
  db.setEnabled(false);assert.equal(db.context('trading'),'');assert.deepEqual(db.recentProjects(),[]);assert.throws(()=>db.save('new note'));
  db.close();db=new MemoryStore(file);assert.equal(db.enabled(),false);assert.equal(db.list().length,1);
  db.delete(note.id);assert.equal(db.list().length,0);db.setEnabled(true);db.save('A useful note');db.clear();assert.deepEqual(db.list(),[]);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('retrieval is relevant, bounded, and does not fabricate unrecorded projects',()=>{
 const db=new MemoryStore(':memory:');try {
  for(let i=0;i<10;i++)db.save(`Trading journal item ${i}`);
  db.save('I like calm conversation','preference');
  assert.equal(db.search('trading journal').length,4);assert(!db.context('trading').includes('calm conversation'));
  assert.deepEqual(db.search('unrelated'),[]);assert.equal(db.context('the what about'), '');assert.deepEqual(db.recentProjects(),[]);
  db.save('Finish JARVIS memory integration','summary');assert.equal(db.recentProjects()[0].kind,'summary');
  assert(db.context('trading').length<4700);
 }finally{db.close();}
});
test('credential-like inputs and malformed data are refused without reflecting them',()=>{
 for(const text of ['My password is PLACEHOLDER_ONLY','API key = EXAMPLE_ONLY','Bearer EXAMPLE_ONLY','X'.repeat(45),null,'', 'x'.repeat(2001),'bad\0note']) assert.throws(()=>safeMemoryText(text));
 const db=new MemoryStore(':memory:');try{assert.throws(()=>db.save('Safe fact','unexpected'));assert.throws(()=>db.save('Safe fact','fact','missing'));assert.deepEqual(db.list(),[]);}finally{db.close();}
});
