import { randomUUID } from 'node:crypto';
import { MemoryStore, LocalInputError, safeMemoryText } from './memory-store';
import { ActionRunner, parseAction, validateAction, commandText } from './actions';
import type { ControlRequest, ControlResult, Proposal } from '../shared';
export interface FeatureHost {
  chooseFolder(signal:AbortSignal): Promise<{id:string;name:string;path:string}|null>;
  exportMemory(contents:string,signal:AbortSignal): Promise<boolean>;
}
export interface TurnFeatures {
  readonly revision: number;
  voice(text:string,signal:AbortSignal):Promise<{text:string;proposal?:Proposal;error?:boolean}|null>;
  context(text:string):string;
  cancel():void;
}
const input = (value:unknown,max=2000) => {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\x00-\x1f]/.test(value))throw new LocalInputError('Invalid local-control input.');return value.trim();
};
export class LocalFeatures implements TurnFeatures {
  revision=0;
  private pending: {proposal:Proposal;expires:number;run:(signal:AbortSignal)=>Promise<string>}|null=null;
  constructor(readonly memory:MemoryStore,readonly actions:ActionRunner,private host:FeatureHost) {}
  cancel(){this.pending=null;}
  context(text:string){return this.memory.context(text);}
  private propose(description:string,run:(signal:AbortSignal)=>Promise<string>):ControlResult {
    const proposal={id:randomUUID(),description};this.pending={proposal,expires:Date.now()+60_000,run};
    return {ok:true,text:'Confirmation required: '+description,proposal};
  }
  private status(text='Local settings loaded.'):ControlResult {
    return {ok:true,text,enabled:this.memory.enabled(),memories:this.memory.list(),folders:[...this.actions.folders].map(([id,f])=>({id,name:f.name})),shortcuts:[...this.actions.shortcuts]};
  }
  async control(value:unknown,signal:AbortSignal):Promise<ControlResult> {
    try {
      signal.throwIfAborted();
      if(!value||typeof value!=='object')throw new LocalInputError('Invalid local-control request.');
      const q=value as ControlRequest;
      if(q.kind==='confirm') {
        const pending=this.pending;this.pending=null;
        if(typeof q.approved!=='boolean'||!pending||pending.proposal.id!==q.id||pending.expires<Date.now()) throw new LocalInputError('Confirmation expired or does not match. Request the action again.');
        if(!q.approved)return this.status('Action cancelled.');
        const text=await pending.run(signal);return this.status(text);
      }
      switch(q.kind) {
        case 'memory-list':return this.status();
        case 'memory-enabled': if(typeof q.enabled!=='boolean')throw new LocalInputError('Invalid memory setting.');this.memory.setEnabled(q.enabled);this.revision++;this.cancel();return this.status(q.enabled?'Memory enabled. Only explicit saves are stored.':'Memory disabled. Stored notes are excluded from conversations; you may still inspect, export or delete them.');
        case 'memory-save': {
          const text=safeMemoryText(q.text);
          if(q.id!==undefined) {
            const id=input(q.id,100);if(!this.memory.get(id))throw new LocalInputError('Memory does not exist.');
            return this.propose(`Replace selected memory with: ${text}`,async()=>{this.memory.save(text,q.category,id);this.revision++;return 'Memory updated.';});
          }
          this.memory.save(text,q.category);this.revision++;return this.status('Memory saved locally.');
        }
        case 'memory-delete': {
          const id=input(q.id,100),entry=this.memory.get(id);if(!entry)throw new LocalInputError('Memory does not exist.');
          return this.propose(`Delete memory: ${entry.text}`,async()=>{this.memory.delete(id);this.revision++;return 'Memory deleted.';});
        }
        case 'memory-clear':return this.propose('Delete ALL stored memories. This cannot be undone.',async()=>{this.memory.clear();this.revision++;return 'All stored memories deleted.';});
        case 'memory-export':return this.status(await this.host.exportMemory(this.memory.export(),signal)?'Memory exported to the selected local file. Keep it private.':'Export cancelled.');
        case 'folder-approve': {
          if(this.actions.folders.size>=20)throw new LocalInputError('At most 20 folders can be approved per session. Revoke one first.');
          const folder=await this.host.chooseFolder(signal);signal.throwIfAborted();if(!folder)return this.status('Folder selection cancelled.');
          if([...this.actions.folders.values()].some(f=>f.path===folder.path))return this.status('Folder is already approved.');
          this.actions.folders.set(folder.id,{name:folder.name,path:folder.path});return this.status('Folder approved for read-only access until JARVIS exits.');
        }
        case 'folder-revoke':this.actions.folders.delete(input(q.id,100));return this.status('Folder access revoked.');
        case 'shortcut-approve': {
          const a=validateAction({kind:'shortcut',name:q.name});if(a.kind!=='shortcut')throw new LocalInputError('Invalid shortcut.');
          if(this.actions.shortcuts.size>=20)throw new LocalInputError('Too many approved shortcuts.');
          this.actions.shortcuts.add(a.name);return this.status('Shortcut allowlisted for this session. Every run still requires confirmation.');
        }
        case 'shortcut-revoke':this.actions.shortcuts.delete(input(q.name,80));return this.status('Shortcut revoked.');
        case 'action': {
          const action=validateAction(q.action);
          if(this.actions.needsConfirmation(action))return this.propose(this.actions.describe(action),s=>this.actions.execute(action,s));
          return this.status(await this.actions.execute(action,signal));
        }
        default:throw new LocalInputError('Unsupported local-control request.');
      }
    } catch(error) {
      return {ok:false,text:signal.aborted?'Cancelled.':error instanceof LocalInputError?error.message:'Local operation failed or permission was denied. No success could be verified.'};
    }
  }
  async voice(raw:string,signal:AbortSignal) {
    this.cancel();
    const text=commandText(raw);
    let m:RegExpMatchArray|null;
    try {
      let q:ControlRequest|undefined;
      if((m=text.match(/^remember (?:that\s+|(?:(preference|project|summary)\s*:\s*))(.+)$/i))) q={kind:'memory-save',category:(m[1]?.toLowerCase()??'fact') as 'fact'|'preference'|'project'|'summary',text:m[2]};
      else if((m=text.match(/^forget (?:that\s+)?(.+)$/i))) {
        const matches=this.memory.list().filter(e=>e.text.toLowerCase()===m![1].toLowerCase());
        if(matches.length!==1)return {text:'No unique stored memory matches that exact text. Inspect Memory & controls to select an entry.'};
        q={kind:'memory-delete',id:matches[0].id};
      } else if(/^what (?:do you remember|have you stored)(?: about me)?$/i.test(text)) {
        return {text:this.memory.enabled()?this.format(this.memory.list().slice(0,4)):'Memory is disabled. No stored notes are being used.'};
      } else if((m=text.match(/^what do you remember about (.+)$/i))) return {text:this.memory.enabled()?this.format(this.memory.search(m[1])):'Memory is disabled. No stored notes are being used.'};
      else if(/^what were we working on last time$/i.test(text))return {text:this.memory.enabled()?this.format(this.memory.recentProjects()):'Memory is disabled. No stored notes are being used.'};
      else if(/^disable memory$/i.test(text))q={kind:'memory-enabled',enabled:false};
      else if(/^(?:remember|enable memory|what do you remember)\b/i.test(text))return {text:'Use “Remember that …” to save a note, or Memory & controls to manage stored memory. Nothing was saved.',error:true};
      else {
        const action=parseAction(text);if(action)q={kind:'action',action};
      }
      if(!q)return null;
      const result=await this.control(q,signal);return {text:result.text,proposal:result.proposal,error:!result.ok};
    }catch(error){return {text:error instanceof LocalInputError?error.message:'Local command failed. No action could be verified.',error:true};}
  }
  private format(entries: ReturnType<MemoryStore['list']>) {return entries.length?'Stored notes: '+entries.map(e=>`[${e.kind}] ${e.text}`).join('; ').slice(0,4500):'No matching notes are stored. I do not have a saved memory of that.';}
}

// If SQLite is unavailable, chat may continue but cannot promise saves or actions.
export const unavailableFeatures:TurnFeatures={
  revision:0,context:()=>'',cancel:()=>{},
  async voice(text) {
    const command=commandText(text);
    try {
      if(/^(?:remember|forget|enable memory|disable memory|what do you remember|what were we working on)/i.test(command)||parseAction(command))
        return {text:'Local memory and controls are unavailable. Check local storage permissions and restart; nothing was saved or executed.',error:true};
    }catch{return {text:'Local command is unavailable; nothing was executed.',error:true};}
    return null;
  }
};
