import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIPv4 } from 'node:net';
import { privateIPv4,safeLabel } from './address';
import { LocalInputError } from '../memory-store';
import type { SmartLight } from '../../shared';
export interface HomeConfig {url:string;token:string;lights:{id:string;name:string}[]}
export function homeConfig(value:unknown):HomeConfig {
  if(!value||typeof value!=='object')throw new LocalInputError('Invalid Home Assistant configuration.');
  const item=value as Record<string,unknown>;let url:URL;
  try{url=new URL(String(item.url));}catch{throw new LocalInputError('Use a local Home Assistant URL.');}
  const host=url.hostname,loopback=host==='127.0.0.1'||host==='localhost';
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['http:','https:'].includes(url.protocol)||!loopback&&!privateIPv4(host)&&!/^[-a-z\d.]+\.(?:local|home\.arpa)$/i.test(host)||url.protocol==='http:'&&!loopback)throw new LocalInputError('Home Assistant requires trusted HTTPS on a private IP/.local/.home.arpa host, or HTTP on localhost only.');
  if(typeof item.token!=='string'||item.token.length<10||item.token.length>4096||/[\s\x00-\x1f]/.test(item.token))throw new LocalInputError('Invalid local token format. No credentials are displayed.');
  if(!Array.isArray(item.lights)||item.lights.length<1||item.lights.length>16)throw new LocalInputError('Configure between 1 and 16 explicitly approved lights.');
  const seen=new Set<string>(),names=new Set<string>();
  const lights=item.lights.map(value=>{
    const light=value as {id:unknown;name:unknown};
    if(!light||typeof light.id!=='string'||!/^light\.[a-z\d_]{1,80}$/.test(light.id)||!safeLabel(light.name,80)||! /^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(String(light.name))||seen.has(light.id)||names.has(String(light.name).toLowerCase()))throw new LocalInputError('Only uniquely named, explicitly allowlisted light entities are supported.');
    seen.add(light.id);names.add(String(light.name).toLowerCase());return {id:light.id,name:String(light.name)};
  });
  return {url:url.origin,token:item.token,lights};
}
export type LocalRest=(config:HomeConfig,path:string,method:'GET'|'POST',body:unknown,signal:AbortSignal)=>Promise<unknown>;
async function localAddress(host:string,signal:AbortSignal):Promise<string>{
  if(host==='localhost')return '127.0.0.1';if(isIPv4(host))return host;
  const timeout=AbortSignal.any([signal,AbortSignal.timeout(4000)]);
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new LocalInputError('Local Home Assistant name resolution timed out or was cancelled.'));
    timeout.addEventListener('abort',abort,{once:true});if(timeout.aborted){abort();return;}
    void lookup(host,{family:4}).then(result=>{timeout.removeEventListener('abort',abort);if(timeout.aborted)abort();else resolve(result.address);},()=>{timeout.removeEventListener('abort',abort);reject(new LocalInputError('Local Home Assistant name could not be resolved.'));});
  });
}
export const localRest:LocalRest=async(config,path,method,body,signal)=>{
  signal.throwIfAborted();const url=new URL(config.url),host=url.hostname;
  const resolved=await localAddress(host,signal);
  signal.throwIfAborted();if(!privateIPv4(resolved)&&resolved!=='127.0.0.1')throw new LocalInputError('Home Assistant resolved outside a private local address. Request refused.');
  const bytes=body===undefined?undefined:Buffer.from(JSON.stringify(body));
  return new Promise((resolve,reject)=>{
    // Connect to the checked IP; retain original Host/SNI for TLS identity checks.
    // Redirects are never followed and certificate validation is never disabled.
    const request=(url.protocol==='https:'?httpsRequest:httpRequest)({protocol:url.protocol,hostname:resolved,servername:isIPv4(host)?undefined:host,port:url.port||undefined,path,method,signal,headers:{Host:url.host,Authorization:`Bearer ${config.token}`,...(bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{})}},response=>{
      const chunks:Buffer[]=[];let length=0;
      response.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>524288){request.destroy();reject(new LocalInputError('Home Assistant response exceeded the size limit.'));}else chunks.push(chunk);});
      response.on('error',()=>reject(new LocalInputError('Home Assistant connection failed.')));
      response.on('end',()=>{if(!response.statusCode||response.statusCode<200||response.statusCode>=300){reject(new LocalInputError('Home Assistant rejected the request. Check local authorization and permissions.'));return;}try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new LocalInputError('Invalid Home Assistant response.'));}});
    });
    request.setTimeout(5000,()=>request.destroy());request.on('error',()=>reject(new LocalInputError('Home Assistant unavailable or permission/certificate check failed.')));request.end(bytes);
  });
};
export class HomeAssistant {
  enabled=false;configured=false;error:string|null=null;revision=0;
  private config:HomeConfig|null=null;private lights:SmartLight[]=[];private controller:AbortController|null=null;
  constructor(private rest:LocalRest=localRest){}
  setConfigured(value:boolean){this.configured=value;}
  enable(config:HomeConfig){this.disable();this.config=homeConfig(config);this.lights=this.config.lights.map(light=>({...light,state:'unknown',checkedAt:null}));this.configured=true;this.enabled=true;this.error=null;this.revision++;}
  disable(){this.controller?.abort();this.controller=null;this.config=null;this.enabled=false;this.lights=this.lights.map(light=>({...light,state:'unknown',checkedAt:null}));this.error=null;this.revision++;}
  forget(){this.disable();this.configured=false;this.lights=[];}
  snapshot(now=Date.now()){return {configured:this.configured,enabled:this.enabled,lights:this.lights.map(light=>({...light,state:light.checkedAt!==null&&now>=light.checkedAt&&now-light.checkedAt<45000&&this.enabled?light.state:'unknown' as const})),error:this.error};}
  find(name:string){const matches=this.lights.filter(light=>light.id===name||light.name.toLowerCase()===name.toLowerCase().replace(/^my /,''));if(matches.length!==1)throw new LocalInputError('No unique approved light matches that name. Configure its exact alias locally first.');return matches[0];}
  private async state(id:string,signal:AbortSignal):Promise<SmartLight>{
    const config=this.config,light=this.lights.find(light=>light.id===id);if(!this.enabled||!config||!light)throw new LocalInputError('Smart-home control is disabled or this light is not approved.');
    const data=await this.rest(config,`/api/states/${id}`,'GET',undefined,signal) as {entity_id?:unknown;state?:unknown};signal.throwIfAborted();
    if(data?.entity_id!==id||typeof data.state!=='string')throw new LocalInputError('Home Assistant returned an unexpected entity.');
    const value:SmartLight={...light,state:data.state==='on'||data.state==='off'?data.state:data.state==='unavailable'?'unavailable':'unknown',checkedAt:Date.now()};
    if(this.config!==config)throw new LocalInputError('Integration configuration changed.');this.lights=this.lights.map(item=>item.id===id?value:item);return value;
  }
  async refresh(signal:AbortSignal){
    if(!this.enabled)throw new LocalInputError('Home Assistant is disabled. Import a local configuration and explicitly enable it first.');
    if(this.controller)throw new LocalInputError('A smart-home request is already running.');
    const controller=new AbortController();this.controller=controller;const combined=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(20000)]);
    try{for(const light of this.lights)await this.state(light.id,combined);this.error=null;return 'Approved light states refreshed from Home Assistant; physical reachability was not independently tested.';}
    catch{this.lights=this.lights.map(light=>({...light,state:'unknown',checkedAt:null}));this.error='Home Assistant unavailable, unauthorized, or certificate check failed.';throw new LocalInputError(this.error);}finally{if(this.controller===controller)this.controller=null;}
  }
  async change(id:string,on:boolean,revision:number,signal:AbortSignal){
    if(revision!==this.revision)throw new LocalInputError('Integration changed. Request and confirm the action again.');
    if(this.controller)throw new LocalInputError('A smart-home request is already running.');
    const controller=new AbortController();this.controller=controller;const combined=AbortSignal.any([signal,controller.signal,AbortSignal.timeout(20000)]);
    try{
      const before=await this.state(id,combined),desired=on?'on':'off';
      if(!['on','off'].includes(before.state))throw new LocalInputError('Home Assistant cannot currently verify this light; no control request was sent.');
      if(before.state===desired)return `Home Assistant already reports ${before.name} as ${desired}. No service call was made.`;
      await this.rest(this.config!,`/api/services/light/turn_${desired}`,'POST',{entity_id:id},combined);
      for(let attempt=0;attempt<3;attempt++){
        const state=await this.state(id,combined);if(state.state===desired){this.error=null;return `Home Assistant verified ${state.name} reports state ${desired}. Physical hardware was not independently verified.`;}
        if(attempt<2)await new Promise<void>((resolve,reject)=>{const done=()=>{combined.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,500);const abort=()=>{clearTimeout(timer);reject(new Error('Cancelled'));};combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort();});
      }
      throw new LocalInputError('Home Assistant accepted the request but the resulting state could not be verified. No success is claimed.');
    }catch(error){this.lights=this.lights.map(light=>light.id===id?{...light,state:'unknown',checkedAt:null}:light);this.error='Smart-home action failed or its result could not be verified.';throw error instanceof LocalInputError?error:new LocalInputError(this.error);}finally{if(this.controller===controller)this.controller=null;}
  }
}
