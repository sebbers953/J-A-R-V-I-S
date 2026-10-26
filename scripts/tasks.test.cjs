const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateTasks } = require('../dist/electron/electron/tasks.js');
test('daily tasks preserve dates and completion when serialized across restarts', () => {
 const tasks = [{ id:'one', text:' Review systems ', done:true, date:'2026-10-26' },{ id:'two', text:'Next day', done:false, date:'2026-10-27' }];
 const saved = validateTasks(tasks); const loaded = validateTasks(JSON.parse(JSON.stringify(saved)));
 assert.equal(loaded[0].text,'Review systems'); assert.equal(loaded[0].done,true); assert.equal(loaded.filter(t=>t.date==='2026-10-27').length,1);
});
test('invalid IPC payloads and duplicate identifiers are rejected', () => {
 for (const value of [null, {}, [{id:'a',text:' ',done:false,date:'2026-10-26'}], [{id:'a',text:'Task',done:'yes',date:'2026-10-26'}]]) assert.throws(()=>validateTasks(value));
 const task = {id:'a',text:'Task',done:false,date:'2026-10-26'}; assert.throws(()=>validateTasks([task,task]));
});
test('stale HUD saves cannot erase a concurrently created or completed voice task',()=>{
 const {applyTaskSnapshot}=require('../dist/electron/electron/tasks.js');
 const one={id:'one',text:'Existing',done:false,date:'2026-10-26'};const voice={id:'voice',text:'Voice task',done:false,date:'2026-10-26'};
 assert.throws(()=>applyTaskSnapshot([one,voice],[{...one,done:true}],[one]));
 assert.throws(()=>applyTaskSnapshot([{...one,done:true}],[one],[one]));
 assert.deepEqual(applyTaskSnapshot([one],[{...one,done:true}],[one]),[{...one,done:true}]);
});
