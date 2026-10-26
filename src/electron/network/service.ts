import { Discovery } from './discovery';
import { HomeAssistant } from './home-assistant';
import type { CredentialStore } from './credentials';
import type { ControlResult,NetworkSnapshot,NetworkRequest } from '../../shared';
import { LocalInputError } from '../memory-store';
export type Propose=(description:string,run:(signal:AbortSignal)=>Promise<string>)=>ControlResult;
export class NetworkService {
  constructor(readonly discovery:Discovery,readonly home:HomeAssistant,private credentials:CredentialStore,private importer:(signal:AbortSignal)=>Promise<unknown|null>){}
  async initialize(){this.home.setConfigured(await this.credentials.exists());}
  snapshot():NetworkSnapshot{return {...this.discovery.snapshot(),smart:this.home.snapshot()};}
  async command(value:unknown,signal:AbortSignal,propose:Propose):Promise<ControlResult>{
    signal.throwIfAborted();if(!value||typeof value!=='object')throw new LocalInputError('Invalid network request.');const request=value as NetworkRequest;
    let text:string;
    switch(request.kind){
      case 'configure':this.discovery.configure(request.interfaceId,request.authorized,request.active);text='Selected network authorized for this session. Discovery is still stopped.';break;
      case 'start':text=this.discovery.start();break;
      case 'mac-cache':await this.discovery.updateMacs();text='Read existing macOS ARP metadata where available. This does not test reachability or send probes.';break;
      case 'stop':if(request.revoke!==undefined&&typeof request.revoke!=='boolean')throw new LocalInputError('Invalid network consent change.');if(request.revoke)this.discovery.revoke();else this.discovery.stop();text='Network discovery stopped. Cached reachability is now unknown.';break;
      case 'smart-import':{
        const config=await this.importer(signal);signal.throwIfAborted();if(config===null)return {ok:true,text:'Local configuration import cancelled.'};
        await this.credentials.save(config);this.home.forget();this.home.setConfigured(true);text='Local configuration encrypted with OS secure storage. Home Assistant remains disabled until explicitly enabled.';break;
      }
      case 'smart-enable':if(typeof request.enabled!=='boolean')throw new LocalInputError('Invalid integration setting.');if(request.enabled){const config=await this.credentials.load();signal.throwIfAborted();this.home.enable(config);text='Home Assistant enabled for explicitly allowlisted lights. No state requests have been sent yet.';}else{this.home.disable();text='Home Assistant disabled. Network discovery settings are unchanged.';}break;
      case 'smart-remove':return propose('Remove the encrypted Home Assistant configuration and disable smart control.',async()=>{this.home.forget();await this.credentials.remove();return 'Encrypted integration configuration removed.';});
      case 'smart-refresh':text=await this.home.refresh(signal);break;
      case 'light':{
        if(typeof request.id!=='string'||typeof request.on!=='boolean')throw new LocalInputError('Invalid light action.');
        if(!this.home.enabled)throw new LocalInputError('Home Assistant is disabled.');const light=this.home.find(request.id),revision=this.home.revision;
        return propose(`Turn ${request.on?'on':'off'} approved light “${light.name}” through Home Assistant. This may affect your physical environment.`,s=>this.home.change(light.id,request.on,revision,s));
      }
      default:throw new LocalInputError('Unsupported network or smart-home operation.');
    }
    return {ok:true,text,network:this.snapshot()};
  }
  async voice(text:string,signal:AbortSignal,propose:Propose):Promise<ControlResult|null>{
    if(/^(?:scan (?:my |the )?local network|start (?:the )?network scan)$/i.test(text)){
      const network=this.discovery.selected;if(!network)return {ok:false,text:'Network discovery is disabled. Open SYSTEM → Network Radar, choose your private interface and explicitly authorize it first.'};
      const chosen=network.id,active=this.discovery.active;
      return propose(`Start a 60-second ${active?'active mDNS/SSDP':'passive announcement'} discovery session on ${network.name} (${network.address}). Only proceed on your authorized local network.`,async()=>{if(this.discovery.selected?.id!==chosen||this.discovery.active!==active)throw new LocalInputError('Network settings changed; request the scan again.');return this.discovery.start();});
    }
    if(/^(?:stop|pause) (?:the )?network scan$/i.test(text))return this.command({kind:'stop'},signal,propose);
    if(/^show (?:my )?connected devices$/i.test(text)){
      const snapshot=this.snapshot();return {ok:true,view:'network',text:`Showing Network Radar. ${snapshot.devices.length} devices observed this session; ${snapshot.devices.filter(d=>d.status==='online').length} have fresh local announcements. These are not direct health checks. Discovery is ${snapshot.running?'running':'stopped'}.`};
    }
    const query=text.match(/^is (?:my )?(.+) online$/i);
    if(query){
      if(this.home.enabled){let light;try{light=this.home.find(query[1]);}catch{}if(light){await this.home.refresh(signal);const state=this.home.snapshot().lights.find(item=>item.id===light!.id)!;return {ok:true,text:`Home Assistant currently reports ${state.name}: ${state.state}. This is an integration report, not a direct physical reachability test.`};}}
      const matches=this.snapshot().devices.filter(device=>device.name.toLowerCase()===query[1].toLowerCase()||device.hostname?.toLowerCase()===query[1].toLowerCase()||device.ip===query[1]);
      return {ok:true,text:matches.length===1?`${matches[0].name}: ${matches[0].status}. ${matches[0].statusReason}.`:'No unique current observation or approved smart light matches that exact name. I cannot verify that it is online.'};
    }
    const light=text.match(/^turn (on|off) (?:my )?(.+)$/i);
    if(light){if(!this.home.enabled)return {ok:false,text:'Smart-home control is disabled. Import a local Home Assistant configuration and enable it in SYSTEM → Network Radar first. No action was performed.'};const match=this.home.find(light[2]);return this.command({kind:'light',id:match.id,on:light[1].toLowerCase()==='on'},signal,propose);}
    return null;
  }
  close(){this.discovery.stop();this.home.disable();}
}
