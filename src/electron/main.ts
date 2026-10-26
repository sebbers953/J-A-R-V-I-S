import { app, BrowserWindow, ipcMain, session, systemPreferences } from 'electron';
import { cpus, freemem, totalmem, uptime, hostname, platform } from 'node:os';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateTasks } from './tasks';
import type { Metrics } from '../shared';
const exec = promisify(execFile);
let win: BrowserWindow | null = null;
let previous = cpus();
let saveQueue: Promise<void> = Promise.resolve();
const taskPath = () => join(app.getPath('userData'), 'tasks.json');
async function metrics(): Promise<Metrics> {
  const current = cpus(); let idle = 0; let total = 0;
  current.forEach((cpu, i) => { const old = previous[i]; if (!old) return; idle += cpu.times.idle - old.times.idle; for (const key of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) total += cpu.times[key] - old.times[key]; }); previous = current;
  let battery: number | null = null; let charging: boolean | null = null;
  if (process.platform === 'darwin') {
    try { const { stdout } = await exec('/usr/bin/pmset', ['-g', 'batt'], { timeout: 1500 }); const match = stdout.match(/(\d+)%;/); battery = match ? Number(match[1]) : null; charging = battery === null ? null : /AC Power/.test(stdout); } catch { /* Desktop Macs may not have a battery. */ }
  }
  return { platform: platform(), hostname: hostname(), cpu: total ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0, memoryUsed: totalmem() - freemem(), memoryTotal: totalmem(), uptime: uptime(), battery, charging };
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (contents !== win?.webContents || permission !== 'media' || !('mediaTypes' in details) || !details.mediaTypes?.length || !details.mediaTypes.every(type => type === 'audio')) return callback(false);
    callback(process.platform !== 'darwin' || await systemPreferences.askForMediaAccess('microphone'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => contents === win?.webContents && permission === 'media' && details.mediaType === 'audio');
  ipcMain.handle('metrics', () => metrics());
  ipcMain.handle('tasks:load', async () => { try { return validateTasks(JSON.parse(await readFile(taskPath(), 'utf8'))); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; } });
  ipcMain.handle('tasks:save', (_event, value: unknown) => {
    const tasks = validateTasks(value);
    const operation = saveQueue.catch(() => {}).then(async () => { await mkdir(app.getPath('userData'), { recursive: true }); await writeFile(taskPath() + '.tmp', JSON.stringify(tasks), { mode: 0o600 }); await rename(taskPath() + '.tmp', taskPath()); });
    saveQueue = operation; return operation;
  });
  ipcMain.handle('fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
  const createWindow = () => {
    win = new BrowserWindow({ width: 1440, height: 960, minWidth: 850, minHeight: 650, fullscreen: true, backgroundColor: '#030b12', title: 'JARVIS', webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.loadFile(join(__dirname, '../../index.html'));
    win.on('closed', () => { win = null; });
  };
  createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
