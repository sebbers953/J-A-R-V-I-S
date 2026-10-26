import { loadAssistantConfig } from './config';
import { Assistant } from './assistant';
import { app, BrowserWindow, ipcMain, session, systemPreferences, dialog, shell, safeStorage } from 'electron';
import { cpus, uptime, hostname, platform } from 'node:os';
import { readFile, writeFile, mkdir, rename, statfs, realpath, stat } from 'node:fs/promises';
import { join, basename, parse } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from './memory-store';
import { LocalFeatures, unavailableFeatures } from './local-features';
import { ActionRunner } from './actions';
import { macHost } from './mac-host';
import { authorized } from './authorization';
import { Discovery } from './network/discovery';
import { HomeAssistant } from './network/home-assistant';
import { CredentialStore } from './network/credentials';
import { NetworkService } from './network/service';
import { assistantHealth } from './health';
import { collectMemory } from './memory';
import { validateTasks, applyTaskSnapshot } from './tasks';
import type { Metrics } from '../shared';
const exec = promisify(execFile);
// Read credentials only here; never inject them into renderer or preload.
const assistantConfig = loadAssistantConfig(app.getAppPath());
let assistant = new Assistant(assistantConfig);
let features: LocalFeatures | null = null;
let memory: MemoryStore | null = null;
let network:NetworkService|null=null;
let controlController: AbortController | null = null;
for (const name of ['OLLAMA_MODEL', 'GROK_API_KEY', 'GROK_MODEL', 'JARVIS_SPEECH_DIR', 'JARVIS_TTS_VOICE', 'FISH_AUDIO_API_KEY', 'FISH_AUDIO_MODEL_ID', 'XAI_API_KEY', 'XAI_DEBUG', 'OPENAI_API_KEY']) delete process.env[name];
console.info('[JARVIS] backend=Ollama endpoint=loopback speech=local api_keys=not-required');
let win: BrowserWindow | null = null;
let previous = cpus();
let saveQueue: Promise<void> = Promise.resolve();
const taskPath = () => join(app.getPath('userData'), 'tasks.json');
async function taskAccess(update?: (tasks: import('../shared').Task[]) => import('../shared').Task[]) {
  const operation=saveQueue.catch(()=>{}).then(async()=>{
    let tasks: import('../shared').Task[];
    try {tasks=validateTasks(JSON.parse(await readFile(taskPath(),'utf8')));} catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT')tasks=[];else throw error;}
    if(update) {tasks=validateTasks(update(tasks));await mkdir(app.getPath('userData'),{recursive:true});await writeFile(taskPath()+'.tmp',JSON.stringify(tasks),{mode:0o600});await rename(taskPath()+'.tmp',taskPath());}
    return tasks;
  });
  saveQueue=operation.then(()=>{},()=>{});return operation;
}
async function metrics(): Promise<Metrics> {
  const current = cpus(); let idle = 0; let total = 0;
  current.forEach((cpu, i) => { const old = previous[i]; if (!old) return; idle += cpu.times.idle - old.times.idle; for (const key of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) total += cpu.times[key] - old.times[key]; }); previous = current;
  let battery: number | null = null; let charging: boolean | null = null;
  if (process.platform === 'darwin') {
    try { const { stdout } = await exec('/usr/bin/pmset', ['-g', 'batt'], { timeout: 1500 }); const match = stdout.match(/(\d+)%;/); battery = match ? Number(match[1]) : null; charging = battery === null ? null : /AC Power/.test(stdout); } catch { /* Desktop Macs may not have a battery. */ }
  }
  let storageUsed: number | null = null; let storageTotal: number | null = null;
  try { const disk = await statfs(app.getPath('home')); storageTotal = disk.blocks * disk.bsize; storageUsed = (disk.blocks - disk.bfree) * disk.bsize; } catch { /* Unavailable volumes remain explicitly unknown. */ }
  return { storageUsed, storageTotal, platform: platform(), hostname: hostname(), cpu: total ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0, ...await collectMemory(), uptime: uptime(), battery, charging };
}
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.whenReady().then(async() => {
  if(!primaryInstance)return;
  network=new NetworkService(new Discovery(),new HomeAssistant(),new CredentialStore(join(app.getPath('userData'),'home-assistant.enc'),safeStorage),async signal=>{
    if(!win)return null;
    const result=await dialog.showOpenDialog(win,{title:'Import local Home Assistant configuration (credentials stay in main process)',properties:['openFile'],filters:[{name:'Local JSON configuration',extensions:['json']}]});
    signal.throwIfAborted();if(result.canceled||!result.filePaths[0])return null;
    const path=result.filePaths[0];if((await stat(path)).size>12000)throw new Error('Configuration too large');
    const bytes=await readFile(path);signal.throwIfAborted();if(bytes.length>12000)throw new Error('Configuration too large');
    try{return JSON.parse(bytes.toString('utf8'));}catch{throw new Error('Invalid local configuration');}
  });
  await network.initialize();
  try {
    memory = new MemoryStore(join(app.getPath('userData'),'memory.sqlite'));
    features = new LocalFeatures(memory,new ActionRunner(macHost(taskAccess,url=>shell.openExternal(url))),{
      async chooseFolder(signal) {
        if(!win)return null;
        const result=await dialog.showOpenDialog(win,{title:'Approve read-only folder access for this session',properties:['openDirectory']});
        signal.throwIfAborted();if(result.canceled||!result.filePaths[0])return null;
        const path=await realpath(result.filePaths[0]);
        if(path===parse(path).root||path===app.getPath('home')||/(?:^|\/)(?:\.[^/]+|Library|System|Applications|private|etc|var)(?:\/|$)/i.test(path))throw new Error('Folder not eligible');
        return {id:randomUUID(),name:basename(path),path};
      },
      async exportMemory(contents,signal) {
        if(!win)return false;
        const result=await dialog.showSaveDialog(win,{title:'Export private local memories',defaultPath:join(app.getPath('documents'),'jarvis-memory-export.json'),filters:[{name:'JSON',extensions:['json']}]});
        signal.throwIfAborted();if(result.canceled||!result.filePath)return false;
        await writeFile(result.filePath,contents,{mode:0o600,flag:'wx'});return true;
      }
    },network);
    assistant = new Assistant(assistantConfig,undefined,features);
  } catch { assistant=new Assistant(assistantConfig,undefined,unavailableFeatures);console.warn('[JARVIS] local_features=unavailable database_initialization_failed'); }

  session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (contents !== win?.webContents || permission !== 'media' || !('mediaTypes' in details) || !details.mediaTypes?.length || !details.mediaTypes.every(type => type === 'audio')) return callback(false);
    callback(process.platform !== 'darwin' || await systemPreferences.askForMediaAccess('microphone'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => contents === win?.webContents && permission === 'media' && details.mediaType === 'audio');
  const trusted = (event: Electron.IpcMainInvokeEvent) => authorized(event,win);
  const assertTrusted=(event:Electron.IpcMainInvokeEvent)=>{if(!trusted(event))throw new Error('Request denied.');};
  ipcMain.handle('control',async(event,payload:unknown)=>{
    assertTrusted(event);
    if(!features)return {ok:false,text:'Local memory and controls are unavailable. Check local storage permissions and restart.'};
    if(controlController||assistant.busy())return {ok:false,text:'Wait for the current operation or interrupt it first.'};
    const controller=new AbortController();controlController=controller;
    try {const revision=features.revision;const result=await features.control(payload,controller.signal);if(features.revision!==revision)assistant.forgetSession();return result;} finally {controlController=null;}
  });
  ipcMain.handle('network:stop',(event,revoke:unknown)=>{assertTrusted(event);if(revoke!==undefined&&typeof revoke!=='boolean')throw new Error('Invalid discovery consent change.');features?.cancel();if(revoke)network!.discovery.revoke();else network!.discovery.stop();return {ok:true,text:'Discovery stopped. Cached reachability is unknown.',network:network!.snapshot()};});
  ipcMain.handle('network:status',event=>{assertTrusted(event);return network!.snapshot();});
  ipcMain.handle('assistant:health',event=>{assertTrusted(event);return assistantHealth(assistantConfig.model,assistantConfig.speech?.voice);});
  ipcMain.handle('window:visibility',event=>{assertTrusted(event);return !!win&&win.isVisible()&&!win.isMinimized();});
  ipcMain.handle('assistant:status', event => ({ configured: trusted(event) && assistant.configured() }));
  ipcMain.handle('assistant:turn', (event, payload: unknown) => trusted(event) && !controlController ? assistant.turn(payload) : { ok: false, message: 'Request denied.' });
  ipcMain.handle('assistant:cancel', event => { if (trusted(event)) { assistant.cancel(); controlController?.abort(); } });
  ipcMain.handle('metrics', event => {assertTrusted(event);return metrics();});
  ipcMain.handle('tasks:load', event => {assertTrusted(event);return taskAccess();});
  ipcMain.handle('tasks:save', (event,value:unknown) => {
    assertTrusted(event);if(!value||typeof value!=='object')throw new Error('Invalid task update.');
    const payload=value as {tasks:unknown;expected:unknown};
    const tasks=validateTasks(payload.tasks),expected=validateTasks(payload.expected);
    return taskAccess(current=>applyTaskSnapshot(current,tasks,expected)).then(()=>undefined);
  });
  ipcMain.handle('fullscreen', event => {assertTrusted(event);win?.setFullScreen(!win.isFullScreen());});
  const createWindow = () => {
    win = new BrowserWindow({ width: 1440, height: 960, minWidth: 850, minHeight: 650, fullscreen: true, backgroundColor: '#080506', title: 'JARVIS', webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const window=win;
    const visibility=()=>{if(!window.isVisible()||window.isMinimized())network?.discovery.stop();if(!window.webContents.isDestroyed())window.webContents.send('window:visibility',window.isVisible()&&!window.isMinimized());};
    window.on('hide',visibility);window.on('minimize',visibility);window.on('show',visibility);window.on('restore',visibility);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.loadFile(join(__dirname, '../../index.html'));
    win.on('closed', () => { assistant.cancel(); controlController?.abort(); win = null; });
  };
  createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('will-quit',()=>{network?.close();assistant.cancel();controlController?.abort();memory?.close();});
