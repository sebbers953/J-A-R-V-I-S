const {test}=require('node:test');const assert=require('node:assert/strict');
const {coreState,makeStars,orbit,reaction}=require('../dist/electron/renderer/core/model.js');
test('visual states follow existing processing/thinking aliases without changing assistant states',()=>{
 for(const [input,expected] of [['IDLE','idle'],['LISTENING','listening'],['PROCESSING','thinking'],['THINKING','thinking'],['SPEAKING','speaking'],['ACTION','action'],['ERROR','error'],['MUTED','idle'],['INTERRUPTED','idle']])assert.equal(coreState(input),expected);
});
test('orbital population has independent radii, inclinations, opposite directions and real depth',()=>{
 const stars=makeStars();assert.equal(stars.length,112);assert.deepEqual(stars,makeStars());
 assert(stars.some(s=>s.speed<0)&&stars.some(s=>s.speed>0));assert(new Set(stars.map(s=>s.node)).size>=4);
 assert(stars.some(s=>{const p=orbit(s,Math.PI/2);return p.z>0&&Math.hypot(p.x,p.y)<.265;}),'Some foreground stars must cross the moon silhouette');
 for(const star of stars){const a=orbit(star,Math.PI/2),b=orbit(star,Math.PI*1.5);assert(a.z>0);assert(b.z<0);assert(a.scale>b.scale);assert(Math.hypot(a.x,a.y)<.6);assert(Math.hypot(b.x,b.y)<.6);}
});
test('listening/speech amplitudes are restrained; thinking tightens a subset; action/error effects expire',()=>{
 const idle=reaction('idle',0),listen=reaction('listening',.7),speech=reaction('speaking',.7),thinking=reaction('thinking',0);
 assert(listen.speed>idle.speed&&listen.speed<thinking.speed);assert(listen.rim>idle.rim);assert(speech.rim>idle.rim);assert(thinking.tighten>0);
 assert(reaction('action',0,.6).action>.9);assert.equal(reaction('action',0,2).action,0);
 assert(reaction('error',0,Infinity,1).error>.9);assert.equal(reaction('error',0,Infinity,3).error,0);
 assert.deepEqual(reaction('speaking',NaN),reaction('speaking',0));assert.deepEqual(reaction('speaking',100),reaction('speaking',1));
});
