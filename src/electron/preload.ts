import { contextBridge, ipcRenderer } from 'electron';
import type { JarvisAPI } from '../shared';
const api: JarvisAPI = {
  assistantHealth:()=>ipcRenderer.invoke('assistant:health'),
  onWindowVisibility(callback) {
    if(typeof callback!=='function')throw new Error('Invalid visibility listener');
    let active=true,sawEvent=false;
    const listener=(_event:Electron.IpcRendererEvent,value:unknown)=>{sawEvent=true;if(active&&typeof value==='boolean')callback(value);};
    ipcRenderer.on('window:visibility',listener);
    void ipcRenderer.invoke('window:visibility').then(value=>{if(active&&!sawEvent&&typeof value==='boolean')callback(value);}).catch(()=>{});
    return ()=>{active=false;ipcRenderer.removeListener('window:visibility',listener);};
  }, control: request => ipcRenderer.invoke('control', request), assistantStatus: () => ipcRenderer.invoke('assistant:status'), assistantTurn: (audio, mime) => ipcRenderer.invoke('assistant:turn', { audio, mime }), assistantCancel: () => ipcRenderer.invoke('assistant:cancel'), metrics: () => ipcRenderer.invoke('metrics'), loadTasks: () => ipcRenderer.invoke('tasks:load'), saveTasks: (tasks, expected) => ipcRenderer.invoke('tasks:save', {tasks, expected}), fullscreen: () => ipcRenderer.invoke('fullscreen') };
contextBridge.exposeInMainWorld('jarvis', api);
