import { contextBridge, ipcRenderer } from 'electron';
import type { JarvisAPI } from '../shared';
const api: JarvisAPI = { metrics: () => ipcRenderer.invoke('metrics'), loadTasks: () => ipcRenderer.invoke('tasks:load'), saveTasks: tasks => ipcRenderer.invoke('tasks:save', tasks), fullscreen: () => ipcRenderer.invoke('fullscreen') };
contextBridge.exposeInMainWorld('jarvis', api);
