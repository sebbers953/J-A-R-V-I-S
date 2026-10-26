import './style.css';
import { initControls } from './controls';
import { initVoice } from './voice';
import type { JarvisAPI, Task } from '../shared';
declare global { interface Window { jarvis?: JarvisAPI } }
const app = document.querySelector<HTMLDivElement>('#app')!;
const gauge = (id: string, title: string) => `<div class="gauge-block"><div class="gauge" id="${id}-gauge"><span>${title}</span><strong id="${id}">—</strong></div><small id="${id}-detail">WAITING FOR HOST</small></div>`;
app.innerHTML = `
<header><div class="brand hud-frame"><div>J A R V I S</div><small>ASSISTANT · SYSTEM · FOCUS · CONTROL</small></div><div class="timeblock"><time id="clock"></time><div id="date"></div></div><div class="header-status"><i></i> LOCAL SYSTEM <button id="fullscreen" title="Toggle fullscreen" aria-label="Toggle fullscreen">⛶</button></div></header>
<main><div class="left-markings" aria-hidden="true"><span>J / 01</span><div></div><span>NEURAL<br>INTERFACE</span><div></div><span>LOCAL<br>PROTOCOL</span></div><section class="core-section"><div class="core-top"><span>NEURAL ENGINE / ONLINE</span><span>J.A.R.V.I.S. / 01</span></div><div class="core" aria-label="Animated multilayer JARVIS core">
<div class="orbit boundary"></div><div class="orbit arc-outer"></div><div class="orbit ticks"></div><div class="orbit arc-middle"></div><div class="orbit fine-ring"></div><div class="orbit segments"></div><div class="orbit arc-inner"></div><div class="scanner"></div><div class="sphere"><svg viewBox="0 0 240 240" aria-hidden="true"><defs><radialGradient id="orb"><stop stop-color="#062b69"/><stop offset=".78" stop-color="#024989"/><stop offset="1" stop-color="#49eaff"/></radialGradient><clipPath id="ball"><circle cx="120" cy="120" r="110"/></clipPath></defs><circle cx="120" cy="120" r="110" fill="url(#orb)"/><g clip-path="url(#ball)" class="sphere-lines">${Array.from({length:12},(_,i)=>`<ellipse cx="120" cy="120" rx="${20+i*9}" ry="109" transform="rotate(${i*29} 120 120)"/>`).join('')}<path d="M-10 140 Q40 10 100 120 T250 80 M-10 160 Q70 240 140 70 T260 120 M-10 80 Q90 210 150 100 T260 170"/></g></svg><div class="sphere-glow"></div><span>JARVIS<small id="core-status">IDLE</small></span></div><div class="orbit particles">${Array.from({length:16},(_,i)=>`<i style="--angle:${i*22.5}deg;--distance:${i%2?43:48}%"></i>`).join('')}</div><div class="crosshair horizontal"></div><div class="crosshair vertical"></div><b class="target t-top"></b><b class="target t-right"></b><b class="target t-bottom"></b><b class="target t-left"></b></div>
<section class="voice"><div class="voice-top"><span>VOICE ASSISTANT</span><span id="mic-status" role="status">IDLE</span></div><div class="voice-control"><canvas id="waveform" aria-label="Live microphone waveform"></canvas><button id="microphone" aria-label="Unmute microphone" aria-pressed="false"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="12" y="3" width="8" height="17" rx="4"/><path d="M8 14v3a8 8 0 0 0 16 0v-3M16 25v5M11 30h10"/></svg></button></div><div class="voice-bottom"><span>LOCAL SPEECH · OLLAMA</span><span id="voice-state">IDLE</span></div><div class="assistant-controls"><button id="send-voice" disabled>Send utterance</button><button id="interrupt-voice" title="Stop speech or processing immediately">Interrupt</button><button id="manage-local">Memory &amp; controls</button><span id="assistant-message" role="status">Checking configuration…</span></div><div class="conversation-options"><label><input type="checkbox" id="continuous-voice"> Continuous conversation · mic resumes after replies; no audio retained</label></div><div id="proposal-home"><div id="action-proposal" hidden><p id="action-description"></p><button id="confirm-action">Confirm action</button><button id="deny-action">Cancel action</button></div></div><div id="conversation" aria-label="Recent conversation" role="log"></div></section></section>
<aside class="right-panels"><section class="panel tasks"><div class="panel-title"><span>▦ &nbsp; DAILY TASKS</span><span id="task-count">00</span></div><div class="task-heading"><span>TODAY'S OBJECTIVES</span><span id="completion">0% COMPLETE</span></div><div class="bar"><i id="task-bar"></i></div><form id="task-form"><input id="task-input" aria-label="New daily task" placeholder="Add an objective…" maxlength="300" required><button title="Add task" aria-label="Add task">+</button></form><div id="task-list"></div><p id="task-status" class="hint" role="status"></p></section>
<section class="panel system"><div class="panel-title"><span>⚙ &nbsp; SYSTEM</span><span id="platform">HOST</span></div><div class="machine" id="machine">CONNECTING</div><div class="gauges">${gauge('cpu','CPU')}${gauge('memory','RAM')}${gauge('storage','SSD')}</div><div class="system-bottom"><div><small>SYSTEM UPTIME</small><strong id="uptime">—</strong></div><div><small>BATTERY</small><strong id="battery">—</strong><div class="bar"><i id="battery-bar"></i></div></div></div><p class="hint" id="telemetry-status">Reading host metrics…</p></section></aside></main><footer><span>JARVIS / LOCAL INTERFACE <b>01</b></span><span><i></i> SECURE LOCAL SESSION</span><span>ESC · TOGGLE FULLSCREEN</span></footer>`;
app.insertAdjacentHTML('beforeend', `<dialog id="local-controls" class="panel"><div class="panel-title"><span>LOCAL MEMORY &amp; CONTROLS</span><button id="close-controls">Close</button></div>
<p class="hint">Memory is saved only when you explicitly request it. Never enter credentials. No automatic conversation summaries. Data stays on this device.</p>
<label><input id="memory-enabled" type="checkbox"> Enable durable memory</label>
<div id="memory-list"></div><select id="memory-category" aria-label="Memory category"><option value="fact">Fact</option><option value="preference">Preference</option><option value="project">Project</option><option value="summary">Approved summary</option></select>
<textarea id="memory-text" maxlength="2000" aria-label="Memory text" placeholder="Explicitly approved note…"></textarea>
<div class="local-buttons"><button id="save-memory">Save note / edit</button><button id="new-memory">New note</button><button id="export-memory">Export</button><button id="clear-memory">Delete all</button></div>
<p class="hint">Voice: “Remember that …”, “Remember project: …”, “Remember summary: …”, “What do you remember about …”, “Forget that [exact text]”, “What were we working on last time?”</p>
<details><summary>Approved Mac commands and permissions</summary><p>Open Safari, Terminal, Finder, Calendar or Activity Monitor; open a complete HTTPS URL; open my trading charts (TradingView); play/pause music (Apple Music); run shortcut [name]. These require confirmation. Terminal opens without commands. Music may require macOS Automation permission.</p><p>Create a task to [title]; list my tasks; complete task [exact title]; what is the date and time. No shell commands, messages, purchases, settings changes or file writes.</p>
<button id="approve-folder">Choose read-only folder</button><div id="folder-list"></div><p class="hint">Folder approval lasts only this session. Commands: “List files in folder [name or ID]”; “Read file [relative.txt] in folder [name or ID]”. Only .txt/.md/.csv up to 16 KB, no hidden or credential files, no symlinks. Whole home/system folders are excluded.</p>
<input id="shortcut-name" aria-label="Exact shortcut name" maxlength="80" placeholder="Exact name of reviewed shortcut"><button id="approve-shortcut">Allowlist shortcut for session</button><div id="shortcut-list"></div><p class="hint">Review your shortcut in Apple's Shortcuts app first. Every run needs confirmation because its effects may be destructive or external.</p></details>
<details><summary>Conversation options</summary><label>Silence before send (seconds) <input id="silence-seconds" type="number" min="0.5" max="5" step="0.1" value="1.2"></label><label>Conversation idle timeout (seconds) <input id="conversation-seconds" type="number" min="15" max="300" value="30"></label><p class="hint">Push-to-talk remains default. Continuous mode is opt-in for each launch; silence submits only after speech. Mic is stopped during processing and playback. Interrupt stops playback immediately. Wake-word listening is unavailable and disabled.</p></details>
<div id="modal-proposal"></div><p id="control-message" role="status"></p></dialog>`);
const el = (id: string) => document.getElementById(id)!;
function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
let today = localDate(); let tasks: Task[] = []; let storageReady = false;
function clock() { const now = new Date(); el('clock').textContent = now.toLocaleTimeString([], { hour12: false }); el('date').textContent = now.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric', year:'numeric' }).toUpperCase(); if (today !== localDate()) { today = localDate(); renderTasks(); } }
clock(); setInterval(clock, 1000);
el('fullscreen').onclick = () => { if (window.jarvis) void window.jarvis.fullscreen(); else if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && window.jarvis) void window.jarvis.fullscreen(); });
function renderTasks() {
  const list = el('task-list'); list.replaceChildren(); const daily = tasks.filter(t => t.date === today); const done = daily.filter(t => t.done).length; const percent = daily.length ? Math.round(done/daily.length*100) : 0;
  el('task-count').textContent = String(daily.length).padStart(2,'0'); el('completion').textContent = `${percent}% COMPLETE`; el('task-bar').style.width = `${percent}%`;
  if (!daily.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'A clear horizon.\nSet your first objective for today.'; list.append(empty); }
  for (const task of daily) { const row = document.createElement('div'); row.className = `task ${task.done ? 'done' : ''}`; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = task.done; check.setAttribute('aria-label', `Complete ${task.text}`); check.onchange = () => void mutate(() => { task.done = check.checked; }); const label = document.createElement('span'); label.textContent = task.text; const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', `Delete ${task.text}`); remove.onclick = () => void mutate(() => { tasks = tasks.filter(t => t.id !== task.id); }); row.append(check,label,remove); list.append(row); }
}
let saving = false;
async function mutate(change: () => void) { if (!storageReady || saving) return; const before = structuredClone(tasks); change(); saving = true; renderTasks(); el('task-status').textContent = 'Saving…'; try { if (window.jarvis) await window.jarvis.saveTasks(tasks,before); else localStorage.setItem('jarvis-tasks', JSON.stringify(tasks)); el('task-status').textContent = 'All objectives saved locally.'; } catch { tasks = before; renderTasks(); await loadTasks(); el('task-status').textContent = 'Save failed or tasks changed. Review the current list and retry.'; } finally { saving = false; } }
el('task-form').onsubmit = e => { e.preventDefault(); const input = el('task-input') as HTMLInputElement; const text = input.value.trim(); if (text && storageReady && !saving) { void mutate(() => { tasks.push({ id:crypto.randomUUID(), text, done:false, date:today }); }); input.value = ''; } };
async function loadTasks() { storageReady=false;try { tasks = window.jarvis ? await window.jarvis.loadTasks() : JSON.parse(localStorage.getItem('jarvis-tasks') || '[]'); if (!Array.isArray(tasks)) throw new Error(); storageReady = true; el('task-status').textContent = window.jarvis ? 'Saved on this device.' : 'Browser preview · saved in this browser.'; } catch { el('task-status').textContent = 'Unable to read tasks. Storage left untouched; restart to retry.'; } renderTasks(); }
void loadTasks();
function setGauge(id: string, percent: number | null, detail: string) {
  el(id).textContent = percent === null ? '—' : `${Math.round(percent)}%`;
  el(`${id}-gauge`).style.setProperty('--value', String(percent === null ? 0 : Math.max(0,Math.min(100,percent))));
  el(`${id}-detail`).textContent = detail;
}
async function updateMetrics() {
  if (!window.jarvis) { el('machine').textContent = 'BROWSER PREVIEW'; el('telemetry-status').textContent = 'Launch Electron for live host telemetry.'; return; }
  try {
    const m = await window.jarvis.metrics(); el('machine').textContent = m.hostname;
    setGauge('cpu',m.cpu,'LIVE CPU LOAD');
    const validMemory = m.memoryUsed !== null && Number.isFinite(m.memoryUsed) && m.memoryUsed >= 0 && Number.isFinite(m.memoryTotal) && m.memoryTotal > 0 && m.memoryUsed <= m.memoryTotal;
    setGauge('memory', validMemory ? m.memoryUsed! / m.memoryTotal * 100 : null, validMemory ? `${(m.memoryUsed!/1024**3).toFixed(1)} / ${Number((m.memoryTotal/1024**3).toFixed(1))} GB` : 'UNAVAILABLE');
    const gb = (value: number | null | undefined) => value == null ? 'unavailable' : `${(value/1024**3).toFixed(2)} GB`;
    el('memory-gauge').title = `Used: app (anonymous minus purgeable) + wired + physical compressor. Cached: ${gb(m.memoryCached)}; compressed: ${gb(m.memoryCompressed)}; wired: ${gb(m.memoryWired)}; swap: ${gb(m.memorySwap)} (separate). Binary GB (GiB).`;
    const pressure = m.memoryPressure;
    el('memory-detail').title = el('memory-gauge').title;
    el('telemetry-status').style.color = pressure ? ({green:'#71cf9a',yellow:'#efc568',red:'#ee7979'})[pressure] : '';

    setGauge('storage',m.storageTotal && m.storageUsed !== null ? m.storageUsed/m.storageTotal*100 : null,m.storageTotal && m.storageUsed !== null ? `${Math.round(m.storageUsed/1024**3)} / ${Math.round(m.storageTotal/1024**3)} GB` : 'UNAVAILABLE');
    el('platform').textContent = m.platform === 'darwin' ? 'macOS' : m.platform.toUpperCase();
    el('uptime').textContent = `${Math.floor(m.uptime/3600)}H ${Math.floor(m.uptime%3600/60)}M`;
    el('battery').textContent = m.battery === null ? 'AC / UNAVAILABLE' : `${m.battery}% · ${m.charging ? 'AC POWER' : 'ON BATTERY'}`;
    el('battery-bar').style.width = `${m.battery ?? 0}%`;
    el('telemetry-status').textContent = `LIVE / 2 SEC · RAM ${validMemory ? 'USED' : 'UNAVAILABLE'} · PRESSURE ${pressure?.toUpperCase() ?? 'UNAVAILABLE'}`;
  } catch { setGauge('memory',null,'UNAVAILABLE'); el('memory-gauge').title = ''; el('memory-detail').title = ''; el('telemetry-status').style.color = ''; el('telemetry-status').textContent = 'Telemetry unavailable · retrying…'; }
}
void updateMetrics(); setInterval(() => void updateMetrics(), 2000);
const voice=initVoice(window.jarvis);
initControls(window.jarvis,voice.pause);
window.addEventListener('jarvis-tasks-refresh',()=>{if(!saving)void loadTasks();});

document.addEventListener('visibilitychange', () => document.body.classList.toggle('page-hidden', document.hidden));
