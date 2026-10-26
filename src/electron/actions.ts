import { randomUUID } from 'node:crypto';
import { lstat, realpath, opendir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve, sep, extname, basename } from 'node:path';
import type { LocalAction, Task } from '../shared';
import { LocalInputError, assertNoSecrets } from './memory-store';
export const APPROVED_APPS: Record<string,string> = { safari:'com.apple.Safari', terminal:'com.apple.Terminal', finder:'com.apple.finder', calendar:'com.apple.iCal', 'activity monitor':'com.apple.ActivityMonitor' };
export function httpsURL(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000 || /[\s\x00-\x1f]/.test(value)) throw new LocalInputError('Use a complete public HTTPS website URL without credentials.');
  let url: URL; try { url = new URL(value); } catch { throw new LocalInputError('Use a complete HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname) || /\.(?:local|localhost|internal|test|invalid)$/i.test(url.hostname)) throw new LocalInputError('Only public HTTPS website URLs without credentials are allowed.');
  return url.href;
}
const plain = (v: unknown, max=300): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max || /[\x00-\x1f]/.test(v)) throw new LocalInputError('Invalid action input.');
  return v.trim();
};
export function validateAction(value: unknown): LocalAction {
  if (!value || typeof value !== 'object') throw new LocalInputError('Unsupported action.');
  const a=value as Record<string,unknown>;
  switch(a.kind) {
    case 'open-app': { const app=plain(a.app).toLowerCase(); if (!Object.hasOwn(APPROVED_APPS,app)) throw new LocalInputError('Application is not on the approved list.'); return {kind:a.kind,app}; }
    case 'open-url': return {kind:a.kind,url:httpsURL(a.url)};
    case 'media': if(a.operation!=='play'&&a.operation!=='pause') break; return {kind:a.kind,operation:a.operation};
    case 'shortcut': { const name=plain(a.name,80); if(!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(name)) break; return {kind:a.kind,name}; }
    case 'task-create': case 'task-complete': return {kind:a.kind,text:plain(a.text)};
    case 'task-list': case 'date': return {kind:a.kind};
    case 'files': return {kind:a.kind,folder:plain(a.folder,100),...(a.path===undefined?{}:{path:plain(a.path,500)})};
  }
  throw new LocalInputError('Unsupported or invalid action.');
}
export function commandText(input:string):string {
  return input.trim().replace(/^jarvis[,,:]?\s+/i,'').replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+)?/i,'').replace(/[.!?]$/,'');
}
// Only anchored, explicit commands can execute tools. Ollama output is never parsed.
export function parseAction(input: string): LocalAction | null {
  const text=commandText(input);
  let m: RegExpMatchArray | null;
  if((m=text.match(/^open (Safari|Terminal|Finder|Calendar|Activity Monitor)$/i))) return {kind:'open-app',app:m[1].toLowerCase()};
  if((m=text.match(/^open (https:\/\/\S+)$/i))) return {kind:'open-url',url:m[1]};
  if(/^open (?:my )?trading charts$/i.test(text)) return {kind:'open-url',url:'https://www.tradingview.com/chart/'};
  if((m=text.match(/^(?:create|add) (?:a )?task (?:to )?(.+)$/i))) return {kind:'task-create',text:m[1]};
  if((m=text.match(/^complete (?:the )?task (.+)$/i))) return {kind:'task-complete',text:m[1]};
  if(/^(?:list (?:my )?tasks|what tasks do I have today|what are my tasks today)$/i.test(text)) return {kind:'task-list'};
  if(/^(?:what(?:'s| is) (?:the )?(?:date|time)(?: and (?:date|time))?(?: today)?|read (?:the )?(?:date|time))$/i.test(text)) return {kind:'date'};
  if((m=text.match(/^(play|pause) (?:my )?music$/i))) return {kind:'media',operation:m[1].toLowerCase() as 'play'|'pause'};
  if((m=text.match(/^run shortcut (.+)$/i))) return {kind:'shortcut',name:m[1]};
  if((m=text.match(/^list files in folder (.+)$/i))) return {kind:'files',folder:m[1]};
  if((m=text.match(/^read file (.+) in folder (.+)$/i))) return {kind:'files',folder:m[2],path:m[1]};
  // Deny unsupported imperative actions rather than letting a model pretend to do them.
  if(/^(?:open|run|execute|delete|remove|send|purchase|buy|install|change|restart|shutdown|move|write|create|complete|list files|read file)\b/i.test(text)) throw new LocalInputError('That command is unsupported. Use Memory & controls to see the approved commands. No action was performed.');
  return null;
}
export interface ActionHost {
  openApp(app: string, signal: AbortSignal): Promise<string>;
  openURL(url: string): Promise<string>;
  media(operation:'play'|'pause', signal: AbortSignal): Promise<string>;
  shortcut(name:string, signal:AbortSignal): Promise<string>;
  tasks(update?: (tasks:Task[])=>Task[]): Promise<Task[]>;
}
export const localDay = () => {const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export class ActionRunner {
  readonly folders=new Map<string,{name:string;path:string}>();
  readonly shortcuts=new Set<string>();
  constructor(private host: ActionHost) {}
  needsConfirmation(a:LocalAction) { return ['open-app','open-url','media','shortcut'].includes(a.kind); }
  describe(a:LocalAction) {
    switch(a.kind) {
      case 'open-app': return `Open ${a.app} (no commands will be entered).`;
      case 'open-url': return `Hand ${a.url} to your default browser. The website may receive a network request.`;
      case 'media': return `${a.operation} playback in Apple Music. macOS may request Automation permission.`;
      case 'shortcut': return `Run approved shortcut “${a.name}”. It may have external or destructive effects defined in Shortcuts; review it there before confirming.`;
      default: return a.kind;
    }
  }
  async execute(value: unknown, signal: AbortSignal): Promise<string> {
    const a=validateAction(value); signal.throwIfAborted();
    switch(a.kind) {
      case 'open-app': return this.host.openApp(a.app,signal);
      case 'open-url': return this.host.openURL(a.url);
      case 'media': return this.host.media(a.operation,signal);
      case 'shortcut': if(!this.shortcuts.has(a.name)) throw new LocalInputError('Shortcut not approved in this session. Add its exact name in Memory & controls first.'); return this.host.shortcut(a.name,signal);
      case 'date': return new Date().toLocaleString([], {dateStyle:'full',timeStyle:'short'});
      case 'task-create': {
        const id=randomUUID();
        const saved=await this.host.tasks(tasks=>[...tasks,{id,text:a.text,done:false,date:localDay()}]);
        if(!saved.some(t=>t.id===id)) throw new LocalInputError('Task could not be verified.');
        return `Created task: ${a.text}`;
      }
      case 'task-list': {
        const tasks=(await this.host.tasks()).filter(t=>t.date===localDay());
        return tasks.length ? tasks.map(t=>`${t.done?'Complete':'Pending'}: ${t.text}`).join('. ').slice(0,4000) : 'No tasks are stored for today.';
      }
      case 'task-complete': {
        let id=''; const saved=await this.host.tasks(tasks=>{
          const matches=tasks.filter(t=>t.date===localDay()&&t.text.toLowerCase()===a.text.toLowerCase());
          if(matches.length!==1) throw new LocalInputError('Task not found or title is ambiguous. Use its exact title.');
          id=matches[0].id;return tasks.map(t=>t.id===id?{...t,done:true}:t);
        });
        if(!saved.find(t=>t.id===id)?.done) throw new LocalInputError('Task completion could not be verified.');
        return `Completed task: ${a.text}`;
      }
      case 'files': {
        const matches=[...this.folders.values()].filter(f=>f.name.toLowerCase()===a.folder.toLowerCase());
        if(!this.folders.has(a.folder)&&matches.length>1)throw new LocalInputError('Folder name is ambiguous. Use its ID from Memory & controls.');
        const folder=this.folders.get(a.folder) ?? matches[0];
        if(!folder) throw new LocalInputError('Folder is not approved. Choose it with the native folder picker first.');
        return readApprovedFolder(folder.path,a.path);
      }
    }
  }
}
const deniedName = /(?:^\.|credential|secret|password|token|private.?key|id_rsa|id_ed25519|keychain)/i;
function within(root:string,path:string) { const rel=relative(root,path);return rel!==''&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel); }
export async function readApprovedFolder(root:string, file?:string):Promise<string> {
  const canonical=await realpath(root);
  if(canonical!==root)throw new LocalInputError('Folder changed. Reapprove it first.');
  if(!file) {
    const entries:string[]=[];const directory=await opendir(root);let examined=0;
    for await(const e of directory){if(!e.isSymbolicLink()&&!deniedName.test(e.name))entries.push(`${e.name}${e.isDirectory()?'/':''}`);if(entries.length>=50||++examined>=1000)break;}
    return entries.length ? entries.join(', ').slice(0,4000) : 'No visible entries in the approved folder.';
  }
  if(isAbsolute(file)||file.split(/[\\/]/).some(part=>part==='..'||deniedName.test(part))) throw new LocalInputError('File path is not allowed.');
  const target=resolve(root,file);
  if(!within(root,target)||!['.txt','.md','.csv'].includes(extname(target).toLowerCase())) throw new LocalInputError('Only non-sensitive .txt, .md and .csv files inside approved folders can be read.');
  let path=root;
  for(const part of relative(root,target).split(sep)) {path=resolve(path,part);if((await lstat(path)).isSymbolicLink())throw new LocalInputError('Symbolic links are not allowed.');}
  if(!within(root,await realpath(target))) throw new LocalInputError('File is outside the approved folder.');
  const handle=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const stat=await handle.stat(); if(!stat.isFile()||stat.size>16000)throw new LocalInputError('Only regular text files up to 16 KB can be read.');
    const bytes=Buffer.alloc(16001);const {bytesRead}=await handle.read(bytes,0,bytes.length,0);
    if(bytesRead>16000)throw new LocalInputError('File is too large.');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,bytesRead));
    // Apply the same credential guard; file text is never stored as memory automatically.
    if(/[\x00-\x08\x0b-\x1f]/.test(text))throw new LocalInputError('File is not plain text.');
    assertNoSecrets(text);
    return `${basename(target)}: ${text.slice(0,4000)}`;
  } finally {await handle.close();}
}
