const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {privateIPv4,sameSubnet}=require('../dist/electron/electron/network/address.js');
const {DeviceStore,parseMdns,parseSsdp}=require('../dist/electron/electron/network/device-store.js');
const {Discovery}=require('../dist/electron/electron/network/discovery.js');
const net={id:'en0:192.168.4.2',name:'en0',address:'192.168.4.2',netmask:'255.255.255.0'};
function transport(){const dns=new EventEmitter(),socket=new EventEmitter(),queries=[],sent=[];dns.query=q=>queries.push(q);dns.destroy=()=>dns.destroyed=true;socket.bind=(_port,_ip,cb)=>cb();for(const name of ['addMembership','setMulticastInterface','setMulticastTTL','setMulticastLoopback'])socket[name]=()=>{};socket.send=(...args)=>sent.push(args);socket.close=()=>socket.closed=true;return {dns,socket,queries,sent,makeDns:()=>dns,makeSocket:()=>socket};}
test('only selected private IPv4 subnet hosts are accepted; public, loopback, VPN-like bounds and invalid masks are not targets',()=>{
 for(const ip of ['10.1.2.3','172.16.0.1','172.31.1.2','192.168.1.2'])assert(privateIPv4(ip));
 for(const ip of ['8.8.8.8','127.0.0.1','169.254.1.1','172.32.1.1','::1','999.0.0.1'])assert(!privateIPv4(ip));
 assert(sameSubnet('192.168.4.33',net));for(const ip of ['192.168.5.33','192.168.4.0','192.168.4.255','8.8.8.8'])assert(!sameSubnet(ip,net));assert(!sameSubnet('192.168.4.33',{...net,netmask:'255.0.255.0'}));
});
test('mDNS A records require on-link sender equality; stale/stopped/TTL-zero and ARP metadata never fabricate current reachability',()=>{
 const store=new DeviceStore(net),record={type:'A',name:'speaker.local',data:'192.168.4.33',ttl:120};
 parseMdns([record],'8.8.8.8',net,store,1000);parseMdns([record],'192.168.4.10',net,store,1000);assert.equal(store.snapshot(true,1000).length,0);
 parseMdns([record],'192.168.4.33',net,store,1000);let device=store.snapshot(true,1001)[0];assert.equal(device.status,'online');assert.equal(device.type,'Unknown (mDNS hostname)');assert.equal(device.hostname,'speaker.local');
 assert.equal(store.snapshot(true,999)[0].status,'unknown');assert.equal(store.snapshot(true,46001)[0].status,'unknown');assert.equal(store.snapshot(false,1002)[0].status,'unknown');
 store.macs('? (192.168.4.33) at a:b:c:d:e:f on en0');device=store.snapshot(false,1003)[0];assert.equal(device.mac,'0a:0b:0c:0d:0e:0f');assert.equal(device.status,'unknown');assert.equal(device.lastSeen,1000);assert.equal(device.latencyMs,null);
 parseMdns([{...record,ttl:0}],'192.168.4.33',net,store,5000);assert.equal(store.snapshot(true,5001)[0].status,'offline');assert.equal(store.snapshot(false,5001)[0].status,'unknown');assert.equal(store.snapshot(true,50001)[0].status,'unknown');
 for(const invalid of [{...record,data:'8.8.8.8'},{...record,ttl:NaN},{...record,name:'host.public'},{...record,name:'bad\0.local'}])parseMdns([invalid],'192.168.4.33',net,store,10000);assert.equal(store.snapshot(true,50001)[0].lastSeen,5000);
});
test('SSDP parses bounded headers, ignores LOCATION and invented capabilities; advertised departure is qualified',()=>{
 const store=new DeviceStore(net),packet=Buffer.from('HTTP/1.1 200 OK\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\nCACHE-CONTROL: max-age=120\r\nLOCATION: http://8.8.8.8/private\r\n\r\n');
 parseSsdp(packet,'192.168.4.44',net,store,100);const value=store.snapshot(true,101)[0];assert.equal(value.type,'MediaRenderer (self-advertised)');assert.equal(value.name,'192.168.4.44');assert.equal(value.mac,null);assert(!JSON.stringify(value).includes('LOCATION'));
 parseSsdp(Buffer.alloc(8193),'192.168.4.45',net,store,200);parseSsdp(packet,'8.8.8.8',net,store,200);assert.equal(store.snapshot(true,201).length,1);
 parseSsdp(Buffer.from('NOTIFY * HTTP/1.1\r\nNT: upnp:rootdevice\r\nNTS: ssdp:byebye\r\n\r\n'),'192.168.4.44',net,store,500);assert.equal(store.snapshot(true,501)[0].status,'offline');
});
test('discovery is opt-in, passive sends no queries, active has a bounded burst, and stop closes one service',()=>{
 const wire=transport(),service=new Discovery(()=>[net],wire.makeDns,wire.makeSocket);
 assert.equal(service.running,false);assert.equal(wire.queries.length,0);assert.throws(()=>service.start());assert.throws(()=>service.configure(net.id,false,true));assert.throws(()=>service.configure('public',true,true));
 try{
  service.configure(net.id,true,false);service.start();wire.dns.emit('ready');assert.equal(wire.queries.length,0);assert.equal(wire.sent.length,0);assert.match(service.start(),/already running/);service.stop();assert(wire.dns.destroyed&&wire.socket.closed);service.revoke();assert.equal(service.selected,null);assert.throws(()=>service.start());
 }finally{service.stop();}
 const active=transport(),running=new Discovery(()=>[net],active.makeDns,active.makeSocket);
 try{
  running.configure(net.id,true,true);running.start();active.dns.emit('ready');
  active.dns.emit('response',{answers:Array.from({length:50},(_,i)=>({type:'PTR',name:'_services._dns-sd._udp.local',data:`_service${i}._tcp.local`,ttl:60})),additionals:[]},{address:'192.168.4.3'});
  assert(active.queries.length<=12);assert.equal(active.sent.length,1);assert.equal(active.sent[0][1],1900);assert.equal(active.sent[0][2],'239.255.255.250');assert.match(active.sent[0][0].toString(),/^M-SEARCH/);
  active.dns.emit('error',new Error('PRIVATE_RAW_ERROR'));assert(!JSON.stringify(running.snapshot()).includes('PRIVATE_RAW_ERROR'));assert(running.snapshot().errors.length>0);
 }finally{running.stop();}
});
test('network changes stop and invalidate observation freshness; sessions automatically expire',t=>{
 t.mock.timers.enable({apis:['setInterval','setTimeout','Date'],now:10000});let current=[net];const wire=transport(),service=new Discovery(()=>current,wire.makeDns,wire.makeSocket);
 try{service.configure(net.id,true,false);service.start();wire.dns.emit('response',{answers:[{type:'A',name:'lamp.local',data:'192.168.4.4',ttl:120}],additionals:[]},{address:'192.168.4.4'});assert.equal(service.snapshot().devices[0].status,'online');current=[];t.mock.timers.tick(5000);assert.equal(service.running,false);assert.equal(service.snapshot().devices[0].status,'unknown');assert.match(service.snapshot().errors[0],/Network changed/);
  current=[net];service.configure(net.id,true,false);service.start();t.mock.timers.tick(60000);assert.equal(service.running,false);
 }finally{service.stop();}
});

test('SSDP max-age zero expires observation instead of inventing an offline departure',()=>{const store=new DeviceStore(net);store.observe('192.168.4.44','SSDP',30,100);parseSsdp(Buffer.from('HTTP/1.1 200 OK\r\nST: upnp:rootdevice\r\nCACHE-CONTROL: max-age=0\r\n\r\n'),'192.168.4.44',net,store,200);assert.equal(store.snapshot(true,201)[0].status,'unknown');});
