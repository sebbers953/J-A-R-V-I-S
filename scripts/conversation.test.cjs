const {test}=require('node:test');const assert=require('node:assert/strict');
const {SilenceDetector,conversationCanResume}=require('../dist/electron/conversation.js');
const {nextState}=require('../dist/electron/assistant-state.js');
test('silence detection waits for speech; respects configured duration; ignores invalid input',()=>{
 const detector=new SilenceDetector(1000);assert(!detector.sample(0,5000));assert(!detector.sample(.1,6000));assert(!detector.sample(0,6500));assert(!detector.sample(.1,6800));assert(!detector.sample(0,7799));assert(detector.sample(0,7800));assert(!detector.sample(NaN,9000));
 for(const value of [NaN,0,499,5001,Infinity])assert.throws(()=>new SilenceDetector(value));
});
test('continuous resumption requires consent, no confirmation pending and an unexpired session',()=>{
 assert(!conversationCanResume(false,false,100,50));assert(!conversationCanResume(true,true,100,50));assert(!conversationCanResume(true,false,100,100));assert(conversationCanResume(true,false,100,50));assert(!conversationCanResume(true,false,NaN,50));
});
test('interrupt and error states are distinct, recoverable and cannot speak from stale replies',()=>{
 assert.equal(nextState('SPEAKING','interrupt'),'INTERRUPTED');assert.equal(nextState('PROCESSING','interrupt'),'INTERRUPTED');assert.equal(nextState('INTERRUPTED','reply'),'INTERRUPTED');assert.equal(nextState('INTERRUPTED','start'),'LISTENING');assert.equal(nextState('LISTENING','error'),'ERROR');assert.equal(nextState('ERROR','start'),'LISTENING');assert.equal(nextState('ERROR','reply'),'ERROR');assert.equal(nextState('SPEAKING','mute'),'MUTED');
});
