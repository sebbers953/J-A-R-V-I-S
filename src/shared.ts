export interface Task { id: string; text: string; done: boolean; date: string }
export interface Metrics { platform: string; hostname: string; cpu: number; memoryUsed: number; memoryTotal: number; uptime: number; storageUsed: number | null; storageTotal: number | null; battery: number | null; charging: boolean | null }
export interface JarvisAPI { metrics(): Promise<Metrics>; loadTasks(): Promise<Task[]>; saveTasks(tasks: Task[]): Promise<void>; fullscreen(): Promise<void> }
