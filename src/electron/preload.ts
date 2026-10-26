import { contextBridge, ipcRenderer } from 'electron';
import type { JarvisAPI } from '../shared';
const api: JarvisAPI = { assistantStatus: () => ipcRenderer.invoke('assistant:status'), assistantTurn: (audio, mime) => ipcRenderer.invoke('assistant:turn', { audio, mime }), assistantCancel: () => ipcRenderer.invoke('assistant:cancel'), metrics: () => ipcRenderer.invoke('metrics'), loadTasks: () => ipcRenderer.invoke('tasks:load'), saveTasks: tasks => ipcRenderer.invoke('tasks:save', tasks), fullscreen: () => ipcRenderer.invoke('fullscreen') };
contextBridge.exposeInMainWorld('jarvis', api);
