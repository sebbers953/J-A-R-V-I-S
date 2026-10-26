export interface Task { id: string; text: string; done: boolean; date: string }
export interface MemoryStats { memoryTotal: number; memoryUsed: number | null; memoryCached: number | null; memoryCompressed: number | null; memoryWired: number | null; memorySwap: number | null; memoryPressure: 'green' | 'yellow' | 'red' | null }
export interface Metrics extends MemoryStats { platform: string; hostname: string; cpu: number; uptime: number; storageUsed: number | null; storageTotal: number | null; battery: number | null; charging: boolean | null }
export interface JarvisAPI { assistantStatus(): Promise<{ configured: boolean }>; assistantTurn(audio: Uint8Array, mime: string): Promise<AssistantResult>; assistantCancel(): Promise<void>; metrics(): Promise<Metrics>; loadTasks(): Promise<Task[]>; saveTasks(tasks: Task[]): Promise<void>; fullscreen(): Promise<void> }
export type AssistantState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'MUTED';
export type AssistantResult = { ok: true; user: string; text: string; audio: string | null; warning?: string } | { ok: false; message: string; user?: string };
