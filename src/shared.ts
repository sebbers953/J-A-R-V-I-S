export interface Task { id: string; text: string; done: boolean; date: string }
export interface MemoryStats { memoryTotal: number; memoryUsed: number | null; memoryCached: number | null; memoryCompressed: number | null; memoryWired: number | null; memorySwap: number | null; memoryPressure: 'green' | 'yellow' | 'red' | null }
export interface Metrics extends MemoryStats { platform: string; hostname: string; cpu: number; uptime: number; storageUsed: number | null; storageTotal: number | null; battery: number | null; charging: boolean | null }
export interface AssistantHealth { available:boolean; installed:boolean; model:string|null; voice:'bm_george'|'bm_lewis'|null }
export interface JarvisAPI { networkStatus():Promise<NetworkSnapshot>; networkStop(revoke?:boolean):Promise<ControlResult>; assistantHealth():Promise<AssistantHealth>; onWindowVisibility(callback:(visible:boolean)=>void):()=>void; control(request: ControlRequest): Promise<ControlResult>; assistantStatus(): Promise<{ configured: boolean }>; assistantTurn(audio: Uint8Array, mime: string): Promise<AssistantResult>; assistantCancel(): Promise<void>; metrics(): Promise<Metrics>; loadTasks(): Promise<Task[]>; saveTasks(tasks: Task[], expected: Task[]): Promise<void>; fullscreen(): Promise<void> }
export type AssistantState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'MUTED' | 'INTERRUPTED' | 'ERROR';
export type AssistantResult = { ok: true; user: string; text: string; audio: string | null; view?:'network'; proposal?: Proposal; warning?: string } | { ok: false; message: string; user?: string };
export interface MemoryEntry { id: string; kind: 'fact' | 'preference' | 'project' | 'summary'; text: string; updated: string }
export type LocalAction =
  | { kind: 'open-app'; app: string }
  | { kind: 'open-url'; url: string }
  | { kind: 'media'; operation: 'play' | 'pause' }
  | { kind: 'shortcut'; name: string }
  | { kind: 'task-create'; text: string }
  | { kind: 'task-list' }
  | { kind: 'task-complete'; text: string }
  | { kind: 'date' }
  | { kind: 'files'; folder: string; path?: string };
export interface Proposal { id: string; description: string }
export type ControlRequest =
  | { kind:'network';request:NetworkRequest }
  | { kind: 'memory-list' }
  | { kind: 'memory-save'; text: string; category: MemoryEntry['kind']; id?: string }
  | { kind: 'memory-delete'; id: string }
  | { kind: 'memory-clear' }
  | { kind: 'memory-enabled'; enabled: boolean }
  | { kind: 'memory-export' }
  | { kind: 'folder-approve' }
  | { kind: 'folder-revoke'; id: string }
  | { kind: 'shortcut-approve'; name: string }
  | { kind: 'shortcut-revoke'; name: string }
  | { kind: 'action'; action: LocalAction }
  | { kind: 'confirm'; id: string; approved: boolean };
export interface ControlResult { network?:NetworkSnapshot; view?:'network'; ok: boolean; text: string; proposal?: Proposal; memories?: MemoryEntry[]; enabled?: boolean; folders?: {id:string;name:string}[]; shortcuts?: string[] }
export type DeviceStatus='online'|'offline'|'unknown';
export interface NetworkInterface { id:string;name:string;address:string;netmask:string }
export interface NetworkDevice { id:string;name:string;hostname:string|null;ip:string;mac:string|null;type:string;protocols:string[];status:DeviceStatus;statusReason:string;firstSeen:number;lastSeen:number;expires:number;latencyMs:null }
export interface SmartLight { id:string;name:string;state:'on'|'off'|'unavailable'|'unknown';checkedAt:number|null }
export interface NetworkSnapshot { running:boolean;active:boolean;configured:boolean;interface:NetworkInterface|null;interfaces:NetworkInterface[];endsAt:number|null;devices:NetworkDevice[];errors:string[];smart:{configured:boolean;enabled:boolean;lights:SmartLight[];error:string|null} }
export type NetworkRequest=
 | {kind:'configure';interfaceId:string;authorized:boolean;active:boolean}
 | {kind:'start'} | {kind:'stop';revoke?:boolean} | {kind:'mac-cache'}
 | {kind:'smart-import'} | {kind:'smart-enable';enabled:boolean} | {kind:'smart-remove'} | {kind:'smart-refresh'}
 | {kind:'light';id:string;on:boolean};
