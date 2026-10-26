const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseVmStat,parseSwap,parsePressure}=require('../dist/electron/electron/memory.js');
const total=24*1024**3;
function fixture(size=16384, changes={}) {
 const values={'Anonymous pages':900000,'Pages purgeable':20000,'Pages wired down':100000,'Pages occupied by compressor':190000,'File-backed pages':200000,...changes};
 return `Mach Virtual Memory Statistics: (page size of ${size} bytes)\n`+Object.entries(values).map(([k,v])=>`${k}: ${v}.`).join('\n')+'\nPages stored in compressor: 99999999.\n';
}
test('Apple Silicon uses anonymous minus purgeable + wired + physical compressor, cache and swap separate',()=>{
 const m=parseVmStat(fixture(),total);
 assert.equal(m.memoryUsed,1170000*16384);
 assert.equal((m.memoryUsed/1024**3).toFixed(1),'17.9');
 assert.equal(Math.round(m.memoryUsed/total*100),74);
 assert.equal(m.memoryCached,220000*16384);
 assert.equal(m.memoryCompressed,190000*16384);
 assert.equal(m.memoryWired,100000*16384);
 assert.equal(m.memorySwap,null);
});
test('reads page size rather than assuming 4K, supports zero usage',()=>{
 assert.equal(parseVmStat(fixture(4096),total).memoryUsed,1170000*4096);
 assert.equal(parseVmStat(fixture(16384,{'Anonymous pages':0,'Pages purgeable':0,'Pages wired down':0,'Pages occupied by compressor':0}),total).memoryUsed,0);
});
test('missing, malformed, impossible counters never fall back to full RAM',()=>{
 for(const text of ['',fixture().replace('Anonymous pages:', 'Missing:'),fixture(0),fixture(16384,{'Anonymous pages':-1}),fixture(16384,{'Pages purgeable':999999}),fixture(16384,{'Pages wired down':1500000}),fixture(16384,{'File-backed pages':1500000})]) {
  assert.equal(parseVmStat(text,total).memoryUsed,null);
 }
 for(const capacity of [0,NaN,Infinity,-1])assert.equal(parseVmStat(fixture(),capacity).memoryUsed,null);
});
test('swap units and kernel pressure are independent, unavailable data stays unknown',()=>{
 assert.equal(parseSwap('total = 1024.00M used = 575.60M free = 448.40M (encrypted)'),575.6*1024**2);
 assert.equal(parseSwap('used = 1.5G'),1.5*1024**3);
 assert.equal(parseSwap('used = 0.00M'),0);
 for(const value of ['', 'used = -1M','used = NaNM']) assert.equal(parseSwap(value),null);
 assert.equal(parsePressure('1\n'),'green');assert.equal(parsePressure('2'),'yellow');assert.equal(parsePressure('4'),'red');assert.equal(parsePressure('99'),null);assert.equal(parsePressure(''),null);
});
