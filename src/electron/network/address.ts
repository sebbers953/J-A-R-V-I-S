import { networkInterfaces } from 'node:os';
import { isIPv4 } from 'node:net';
import type { NetworkInterface } from '../../shared';
export function privateIPv4(ip:string):boolean {
  if(!isIPv4(ip))return false;const [a,b]=ip.split('.').map(Number);
  return a===10||a===172&&b>=16&&b<=31||a===192&&b===168;
}
const number=(ip:string)=>ip.split('.').reduce((n,p)=>(n*256+Number(p))>>>0,0);
export function validMask(mask:string):boolean {if(!isIPv4(mask))return false;const bits=number(mask).toString(2).padStart(32,'0');return /^1{8,30}0+$/.test(bits);}
export function sameSubnet(ip:string,network:NetworkInterface):boolean {
  if(!privateIPv4(ip)||!privateIPv4(network.address)||!validMask(network.netmask))return false;
  const mask=number(network.netmask),value=number(ip),host=(value&~mask)>>>0;
  return (value&mask)===(number(network.address)&mask)&&host!==0&&host!==((~mask)>>>0);
}
export function interfaces():NetworkInterface[] {
  const result:NetworkInterface[]=[];
  for(const [name,entries] of Object.entries(networkInterfaces())){
    if(/^(?:utun|tun|tap|ppp|wg|docker|veth|lo)/i.test(name))continue;
    for(const entry of entries??[])if(entry.family==='IPv4'&&!entry.internal&&privateIPv4(entry.address)&&validMask(entry.netmask))result.push({id:`${name}:${entry.address}`,name,address:entry.address,netmask:entry.netmask});
  }
  return result.slice(0,12);
}
export function safeLabel(value:unknown,max=120):string|null {return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value)?value:null;}
