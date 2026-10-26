import { createHash } from 'node:crypto';
import type { NetworkDevice,NetworkInterface } from '../../shared';
import { sameSubnet,safeLabel } from './address';
export class DeviceStore {
  private records=new Map<string,NetworkDevice>();
  constructor(readonly network:NetworkInterface){}
  observe(ip:string,protocol:string,ttl:number,now:number,hostname?:string,type?:string){
    if(!sameSubnet(ip,this.network)||!Number.isFinite(ttl)||ttl<0)return;
    const id=createHash('sha256').update(ip).digest('hex').slice(0,16),old=this.records.get(id);
    if(!old&&this.records.size>=128)return;
    const host=safeLabel(hostname),kind=safeLabel(type,80);
    this.records.set(id,{id,ip,mac:old?.mac??null,name:host??old?.name??ip,hostname:host??old?.hostname??null,type:kind??old?.type??'Unknown',protocols:[...new Set([...(old?.protocols??[]),protocol])].slice(0,3),status:ttl===0?'offline':'online',statusReason:ttl===0?'Advertised departure; not independently verified':'Recent local protocol announcement; not an authentication or health check',firstSeen:old?.firstSeen??now,lastSeen:now,expires:now+(ttl===0?45:Math.min(ttl,45))*1000,latencyMs:null});
  }
  expire(ip:string,now:number){for(const record of this.records.values())if(record.ip===ip){record.expires=now;record.lastSeen=now;record.status='unknown';}}
  macs(text:string){
    for(const line of text.split('\n')){
      const match=line.match(/\((\d+\.\d+\.\d+\.\d+)\) at ((?:[a-f\d]{1,2}:){5}[a-f\d]{1,2})\b/i);if(!match)continue;
      const mac=match[2].split(':').map(part=>part.padStart(2,'0')).join(':').toLowerCase();
      if(mac==='00:00:00:00:00:00'||(parseInt(mac.slice(0,2),16)&1)!==0)continue;
      for(const record of this.records.values())if(record.ip===match[1])record.mac=mac;
    }
  }
  snapshot(running:boolean,now=Date.now()):NetworkDevice[]{
    return [...this.records.values()].map(record=>{
      const fresh=running&&now>=record.lastSeen&&now<record.expires;
      if(record.status==='offline'&&running&&now>=record.lastSeen&&now-record.lastSeen<45000)return {...record};
      return {...record,status:fresh?'online':'unknown',statusReason:fresh?record.statusReason:running?'Not observed recently; reachability is unknown':'Discovery stopped; cached observation, current reachability unknown'};
    });
  }
}
export interface MdnsRecord {type:string;name:string;data:unknown;ttl:number}
export function parseMdns(records:MdnsRecord[],source:string,network:NetworkInterface,store:DeviceStore,now:number){
  if(!sameSubnet(source,network)||records.length>256)return;
  // Only A records contained in an on-link mDNS response are accepted. No TXT,
  // URL, credentials, vendor inference or out-of-subnet addresses are followed.
  for(const record of records){
    if(record.type!=='A'||record.data!==source||typeof record.data!=='string'||!safeLabel(record.name,200)||!record.name.toLowerCase().endsWith('.local'))continue;
    store.observe(record.data,'mDNS',record.ttl,now,record.name,'Unknown (mDNS hostname)');
  }
}
export function parseSsdp(bytes:Buffer,source:string,network:NetworkInterface,store:DeviceStore,now:number){
  if(bytes.length>8192||!sameSubnet(source,network))return;
  const text=bytes.toString('utf8');if(!/^(?:HTTP\/1\.1 200(?: [^\r\n]{0,80})?|NOTIFY \* HTTP\/1\.1)\r?\n/.test(text))return;
  const fields=new Map<string,string>();for(const line of text.split(/\r?\n/).slice(1,45)){const index=line.indexOf(':');if(index>0)fields.set(line.slice(0,index).trim().toLowerCase(),line.slice(index+1).trim());}
  const target=fields.get('st')??fields.get('nt')??'';
  if(!safeLabel(target,180))return;
  const leaving=fields.get('nts')==='ssdp:byebye',cache=fields.get('cache-control'),age=cache?.match(/max-age\s*=\s*(\d+)(?:\s|,|$)/i);
  if(cache&&!age&&!leaving)return;const maxAge=Number(age?.[1]??30);if(!leaving&&maxAge===0){store.expire(source,now);return;}
  const type=/^urn:schemas-upnp-org:device:(MediaRenderer|MediaServer|InternetGatewayDevice):\d+$/.exec(target)?.[1];
  store.observe(source,'SSDP',leaving?0:maxAge,now,undefined,type?`${type} (self-advertised)`:'Unknown (SSDP service)');
  // LOCATION is deliberately not fetched, preventing untrusted URL/SSRF traversal.
}
