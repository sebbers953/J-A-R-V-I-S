export interface Task { id: string; text: string; done: boolean; date: string }
export interface MemoryStats { memoryTotal: number; memoryUsed: number | null; memoryCached: number | null; memoryCompressed: number | null; memoryWired: number | null; memorySwap: number | null; memoryPressure: 'green' | 'yellow' | 'red' | null }
export interface Metrics extends MemoryStats { platform: string; hostname: string; cpu: number; uptime: number; storageUsed: number | null; storageTotal: number | null; battery: number | null; charging: boolean | null }
export interface JarvisAPI { control(request: ControlRequest): Promise<ControlResult>; assistantStatus(): Promise<{ configured: boolean }>; assistantTurn(audio: Uint8Array, mime: string): Promise<AssistantResult>; assistantCancel(): Promise<void>; metrics(): Promise<Metrics>; loadTasks(): Promise<Task[]>; saveTasks(tasks: Task[], expected: Task[]): Promise<void>; fullscreen(): Promise<void> }
export type AssistantState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'MUTED' | 'INTERRUPTED' | 'ERROR';
export type AssistantResult = { ok: true; user: string; text: string; audio: string | null; proposal?: Proposal; warning?: string } | { ok: false; message: string; user?: string };
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
export interface ControlResult { ok: boolean; text: string; proposal?: Proposal; memories?: MemoryEntry[]; enabled?: boolean; folders?: {id:string;name:string}[]; shortcuts?: string[] }
