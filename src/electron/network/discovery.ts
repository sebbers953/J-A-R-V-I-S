import mdns = require('multicast-dns');
import { createSocket,type Socket } from 'node:dgram';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { interfaces,sameSubnet,safeLabel } from './address';
import { DeviceStore,parseMdns,parseSsdp,type MdnsRecord } from './device-store';
import { LocalInputError } from '../memory-store';
import type { NetworkInterface } from '../../shared';
const exec=promisify(execFile);
export class Discovery {
  running=false;active=false;selected:NetworkInterface|null=null;endsAt:number|null=null;store:DeviceStore|null=null;
  readonly errors=new Set<string>();
  private browser:mdns.MulticastDNS|null=null;private ssdp:Socket|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;private watch:ReturnType<typeof setInterval>|undefined;
  private generation=0;private budget=0;private activeUntil=0;private asked=new Set<string>();
  constructor(private list=interfaces,private makeMdns=mdns,private makeSocket=createSocket){}
  configure(id:unknown,authorized:unknown,active:unknown){
    if(authorized!==true||typeof active!=='boolean'||typeof id!=='string')throw new LocalInputError('Authorize your own local network and choose a private IPv4 interface first.');
    const network=this.list().find(item=>item.id===id);if(!network)throw new LocalInputError('Selected private network is unavailable.');
    this.stop();this.selected=network;this.active=active;this.store=new DeviceStore(network);this.errors.clear();
  }
  start(){
    if(this.running)return 'Discovery is already running; no duplicate service was started.';
    const network=this.selected;if(!network)throw new LocalInputError('Discovery is disabled. Choose and authorize a local interface in SYSTEM → Network Radar first.');
    if(!this.list().some(item=>item.id===network.id&&item.netmask===network.netmask))throw new LocalInputError('Network changed. Select and authorize it again.');
    this.errors.clear();this.running=true;this.endsAt=Date.now()+60_000;const generation=++this.generation;this.budget=12;this.activeUntil=Date.now()+8000;this.asked.clear();
    const report=(text:string)=>{if(this.running&&generation===this.generation&&this.errors.size<8)this.errors.add(text);};
    try{
      const browser=this.makeMdns({type:'udp4',interface:network.address,bind:'0.0.0.0',loopback:false,ttl:255});this.browser=browser;
      browser.on('error',()=>report('mDNS unavailable: check local-network permission, firewall or UDP 5353 conflicts.'));
      browser.on('warning',()=>report('Some mDNS packets or multicast membership were unavailable.'));
      browser.on('response',(packet,remote)=>{
        if(!this.running||generation!==this.generation||!sameSubnet(remote.address,network))return;
        const records=[...packet.answers,...packet.additionals];if(records.length>256)return;
        parseMdns(records as MdnsRecord[],remote.address,network,this.store!,Date.now());
        if(this.active)for(const record of records){
          if(record.type==='PTR'&&typeof record.data==='string'&&safeLabel(record.data,200)&&/\._(?:tcp|udp)\.local$/i.test(record.data))this.query(record.data,/^_[^.]+\._(?:tcp|udp)\.local$/i.test(record.data)?'PTR':'SRV');
          if(record.type==='SRV'&&record.data&&typeof record.data==='object'&&'target' in record.data&&typeof record.data.target==='string'&&safeLabel(record.data.target,200)&&record.data.target.endsWith('.local'))this.query(record.data.target,'A');
        }
      });
      browser.on('ready',()=>{if(this.running&&generation===this.generation&&this.active)this.query('_services._dns-sd._udp.local','PTR');});
    }catch{report('mDNS could not start on the selected interface.');}
    try{
      const socket=this.makeSocket({type:'udp4',reuseAddr:true});this.ssdp=socket;
      socket.on('error',()=>report('SSDP unavailable: check local-network permission, firewall or UDP 1900 conflicts.'));
      socket.on('message',(bytes,remote)=>{if(this.running&&generation===this.generation)parseSsdp(bytes,remote.address,network,this.store!,Date.now());});
      socket.bind(1900,'0.0.0.0',()=>{
        if(!this.running||generation!==this.generation){try{socket.close();}catch{}return;}
        try{socket.addMembership('239.255.255.250',network.address);socket.setMulticastInterface(network.address);socket.setMulticastTTL(1);socket.setMulticastLoopback(false);
          if(this.active&&Date.now()<=this.activeUntil)socket.send(Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n'),1900,'239.255.255.250',error=>{if(error)report('SSDP discovery query could not be sent.');});
        }catch{report('SSDP multicast membership is unavailable.');}
      });
    }catch{report('SSDP could not start on the selected interface.');}
    this.timer=setTimeout(()=>this.stop(),60_000);
    this.watch=setInterval(()=>{if(!this.list().some(item=>item.id===network.id&&item.netmask===network.netmask)){this.stop();this.selected=null;this.errors.add('Network changed. Discovery stopped; select and authorize the new network.');}},5000);
    return `Discovery started on ${network.name} (${network.address}) for up to 60 seconds. ${this.active?'A bounded mDNS/SSDP query burst is enabled.':'Passive announcements only; no discovery queries are sent.'} No port or public-IP scanning is performed.`;
  }
  private query(name:string,type:'A'|'PTR'|'SRV'){
    if(!this.running||!this.active||Date.now()>this.activeUntil||this.budget<=0||this.asked.has(name))return;this.asked.add(name);this.budget--;
    try{this.browser?.query({questions:[{name,type}]},()=>{});}catch{if(this.errors.size<8)this.errors.add('An mDNS query could not be encoded or sent.');}
  }
  async updateMacs(){
    if(process.platform!=='darwin'||!this.selected)return;
    const generation=this.generation;
    try{const {stdout}=await exec('/usr/sbin/arp',['-an','-i',this.selected.name],{timeout:1000,maxBuffer:65536,env:{PATH:'/usr/bin:/usr/sbin',LC_ALL:'C'}});if(generation===this.generation)this.store?.macs(stdout);}catch{ /* MAC is optional and never proves reachability. */ }
  }
  revoke(){this.stop();this.selected=null;this.active=false;}
  stop(){
    this.running=false;this.endsAt=null;this.generation++;clearTimeout(this.timer);clearInterval(this.watch);
    try{this.browser?.destroy();}catch{}this.browser=null;try{this.ssdp?.close();}catch{}this.ssdp=null;
  }
  snapshot(){return {running:this.running,active:this.active,configured:!!this.selected,interface:this.selected,interfaces:this.list(),endsAt:this.endsAt,devices:this.store?.snapshot(this.running)??[],errors:[...this.errors]};}
}
