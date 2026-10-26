import './style.css';
import { initNetwork } from './network';
import { layout } from './layout';
import { initControls } from './controls';
import { initVoice } from './voice';
import { connectCoreToHud } from './core/state-bridge';
import type { JarvisAPI, Task, Metrics } from '../shared';
declare global { interface Window { jarvis?: JarvisAPI } }
const app=document.querySelector<HTMLDivElement>('#app')!;app.innerHTML=layout();document.body.dataset.route='home';
const el=(id:string)=>document.getElementById(id)!;
const systemPanel=el('system-panel'),taskPanel=el('tasks-panel');
el('home-system-slot').append(systemPanel);el('home-tasks-slot').append(taskPanel);
const voice=initVoice(window.jarvis),controls=initControls(window.jarvis);
const networkModule=initNetwork(window.jarvis,controls.request);
const visual=connectCoreToHud(el('moon-host'),window.jarvis?.onWindowVisibility);
let nativeVisible=true;
const unsubscribe=window.jarvis?.onWindowVisibility?.(visible=>{nativeVisible=visible;if(visible){void updateMetrics();void updateHealth();}});
window.addEventListener('beforeunload',()=>{networkModule.close();visual.destroy();unsubscribe?.();});
let route='home',systemNetwork=false;
function showSystemNetwork(network:boolean){systemNetwork=network;el('system-host').hidden=network;el('network-module').hidden=!network;el('system-host-tab').setAttribute('aria-pressed',String(!network));el('system-network-tab').setAttribute('aria-pressed',String(network));networkModule.visibility(route==='system'&&network);}
el('system-host-tab').onclick=()=>showSystemNetwork(false);el('system-network-tab').onclick=()=>showSystemNetwork(true);
function navigate(next:string,preserveVoice=false){
  if(!['home','memory','tasks','system','history','settings'].includes(next)||next===route)return;
  if(!preserveVoice)voice.pause();route=next;document.body.dataset.route=next;
  for(const view of document.querySelectorAll<HTMLElement>('.view'))view.hidden=view.id!==`view-${next}`;
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-route]')){if(button.dataset.route===next)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  el('section-label').textContent=next==='home'?'PERSONAL DESKTOP ASSISTANT':`${next.toUpperCase()} / LOCAL WORKSPACE`;
  (el(next==='system'?'system-slot':'home-system-slot')).append(systemPanel);
  (el(next==='tasks'?'tasks-slot':'home-tasks-slot')).append(taskPanel);
  (el('task-form') as HTMLFormElement).hidden=next!=='tasks';
  if(next==='memory'||next==='settings')setTimeout(()=>void controls.refresh(),180);
  networkModule.visibility(next==='system'&&systemNetwork);
  const heading=el(`view-${next}`).querySelector<HTMLElement>('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-route]'))button.onclick=()=>navigate(button.dataset.route!);
document.querySelector<HTMLAnchorElement>('.sidebar-brand')!.onclick=e=>{e.preventDefault();navigate('home');};
el('manage-folders').onclick=()=>{(el('quick-dialog') as HTMLDialogElement).close();navigate('settings');};
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-quick]'))button.onclick=()=>{voice.pause();void controls.openQuick(button.dataset.quick!);};
el('fullscreen').onclick=()=>{if(window.jarvis)void window.jarvis.fullscreen();else if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen();};
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(!el('action-proposal').hidden){event.preventDefault();el('deny-action').click();}else if(!document.querySelector('dialog[open]')&&window.jarvis)void window.jarvis.fullscreen();});
el('push-mode').onclick=()=>{const continuous=el('continuous-voice') as HTMLInputElement;if(continuous.checked){continuous.checked=false;continuous.dispatchEvent(new Event('change'));}};
const mode=new MutationObserver(()=>el('push-mode').setAttribute('aria-pressed',String(!(el('continuous-voice') as HTMLInputElement).checked)));
mode.observe(document.body,{attributes:true,attributeFilter:['data-voice']});
el('continuous-voice').addEventListener('change',()=>el('push-mode').setAttribute('aria-pressed',String(!(el('continuous-voice') as HTMLInputElement).checked)));
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
let today=localDate(),tasks:Task[]=[],storageReady=false,saving=false;
function clock(){const now=new Date();el('clock').textContent=now.toLocaleTimeString([],{hour12:false});el('date').textContent=now.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});if(today!==localDate()){today=localDate();renderTasks();}}
clock();setInterval(clock,1000);
function renderTasks(){
  const list=el('task-list');list.replaceChildren();const daily=tasks.filter(t=>t.date===today),done=daily.filter(t=>t.done).length;
  el('task-count').textContent=`${done} / ${daily.length}`;el('completion').textContent=`${daily.length?Math.round(done/daily.length*100):0}% COMPLETE`;
  if(!daily.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='A clear horizon. Set your first objective.';list.append(empty);}
  for(const task of daily){
    const row=document.createElement('div');row.className=`task ${task.done?'done':''}`;
    const check=document.createElement('input');check.type='checkbox';check.checked=task.done;check.setAttribute('aria-label',`Complete ${task.text}`);check.onchange=()=>void mutate(()=>{task.done=check.checked;});
    const label=document.createElement('span');label.textContent=task.text;const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Delete ${task.text}`);remove.onclick=()=>void mutate(()=>{tasks=tasks.filter(t=>t.id!==task.id);});
    row.append(check,label,remove);list.append(row);
  }
}
async function loadTasks(){storageReady=false;try{tasks=window.jarvis?await window.jarvis.loadTasks():JSON.parse(localStorage.getItem('jarvis-tasks')||'[]');if(!Array.isArray(tasks))throw new Error();storageReady=true;el('task-status').textContent=window.jarvis?'Saved on this device.':'Browser preview · browser storage.';}catch{el('task-status').textContent='Unable to read tasks. Existing storage is untouched.';}renderTasks();}
async function mutate(change:()=>void){
  if(!storageReady||saving){renderTasks();return;}const before=structuredClone(tasks);change();saving=true;renderTasks();
  try{if(window.jarvis)await window.jarvis.saveTasks(tasks,before);else localStorage.setItem('jarvis-tasks',JSON.stringify(tasks));el('task-status').textContent='All objectives saved locally.';}
  catch{tasks=before;renderTasks();await loadTasks();el('task-status').textContent='Save failed or tasks changed. Review and retry.';}finally{saving=false;}
}
el('show-task-form').onclick=()=>{const form=el('task-form');form.hidden=!form.hidden;if(!form.hidden)el('task-input').focus();};
el('task-form').onsubmit=e=>{e.preventDefault();const input=el('task-input') as HTMLInputElement;const text=input.value.trim();if(text&&storageReady&&!saving){void mutate(()=>tasks.push({id:crypto.randomUUID(),text,done:false,date:today}));input.value='';if(route==='home')el('task-form').hidden=true;}};
void loadTasks();window.addEventListener('jarvis-tasks-refresh',()=>{if(!saving)void loadTasks();});
function setGauge(id:string,percent:number|null,detail:string){
  const valid=percent!==null&&Number.isFinite(percent)&&percent>=0&&percent<=100;
  el(id).textContent=valid?`${Math.round(percent!)}%`:'—';el(`${id}-gauge`).style.setProperty('--value',String(valid?percent:0));el(`${id}-detail`).textContent=detail;
}
const gb=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?`${(value/1024**3).toFixed(1)} GB`:'Unavailable';
const percent=(used:number|null,total:number|null)=>used!==null&&total!==null&&Number.isFinite(used)&&Number.isFinite(total)&&total>0&&used>=0&&used<=total?used/total*100:null;
let metricsBusy=false;
function memoryDetails(m:Metrics){
  for(const [id,value] of [['ram-total',m.memoryTotal],['ram-used',m.memoryUsed],['ram-cache',m.memoryCached],['ram-compressed',m.memoryCompressed],['ram-wired',m.memoryWired],['ram-swap',m.memorySwap]] as const)el(id).textContent=gb(value);
  const pressure=m.memoryPressure??null;el('memory-pressure').textContent=pressure?({green:'Normal',yellow:'Elevated',red:'High'})[pressure]:'Unavailable';el('pressure-detail').textContent=pressure?pressure.toUpperCase():'Unavailable';el('memory-pressure').dataset.pressure=pressure??'unknown';
}
async function updateMetrics(){
  if(!nativeVisible||document.hidden||metricsBusy)return;
  if(!window.jarvis){el('machine').textContent='Browser preview';el('telemetry-status').textContent='Launch Electron for live telemetry';return;}
  metricsBusy=true;
  try{
    const m=await window.jarvis.metrics();el('machine').textContent=m.hostname;el('platform').textContent=m.platform==='darwin'?'macOS':m.platform.toUpperCase();
    setGauge('cpu',m.cpu,'LIVE CPU LOAD');const ram=percent(m.memoryUsed,m.memoryTotal);
    setGauge('memory',ram,ram===null?'UNAVAILABLE':`${(m.memoryUsed!/1024**3).toFixed(1)} / ${Number((m.memoryTotal/1024**3).toFixed(1))} GB`);
    const detail=`App (anonymous minus purgeable) + wired + physical compressor. Cache: ${gb(m.memoryCached)}; compressed: ${gb(m.memoryCompressed)}; wired: ${gb(m.memoryWired)}; swap: ${gb(m.memorySwap)} (separate). Binary GB (GiB).`;
    el('memory-gauge').title=detail;el('memory-detail').title=detail;memoryDetails(m);
    const disk=percent(m.storageUsed,m.storageTotal);setGauge('storage',disk,disk===null?'UNAVAILABLE':`${Math.round(m.storageUsed!/1024**3)} / ${Math.round(m.storageTotal!/1024**3)} GB`);
    setGauge('battery',m.battery,m.battery===null?'AC / UNAVAILABLE':`${m.battery}% · ${m.charging===null?'POWER SOURCE UNKNOWN':m.charging?'AC POWER':'ON BATTERY'}`);
    el('uptime').textContent=Number.isFinite(m.uptime)?`${Math.floor(m.uptime/3600)}H ${Math.floor(m.uptime%3600/60)}M`:'—';
    el('telemetry-status').textContent='LIVE HOST DATA · 2 SEC';
  }catch{
    for(const id of ['cpu','memory','storage','battery'])setGauge(id,null,'UNAVAILABLE');
    for(const id of ['ram-total','ram-used','ram-cache','ram-compressed','ram-wired','ram-swap','pressure-detail','memory-pressure'])el(id).textContent='Unavailable';
    el('memory-pressure').dataset.pressure='unknown';el('uptime').textContent='—';el('telemetry-status').textContent='Host data unavailable · retrying';
  }finally{metricsBusy=false;}
}
let healthBusy=false;
async function updateHealth(){
  if(!nativeVisible||document.hidden||healthBusy)return;
  if(!window.jarvis?.assistantHealth){el('ollama-status').textContent=window.jarvis?'UNAVAILABLE':'DESKTOP ONLY';return;}
  healthBusy=true;
  try{const health=await window.jarvis.assistantHealth();el('ollama-status').textContent=health.available?health.installed?'ONLINE':'MODEL MISSING':'OFFLINE';el('ollama-dot').dataset.online=String(health.available&&health.installed);el('model-name').textContent=health.model??'Unavailable';el('voice-preset').textContent=health.voice?`Kokoro · ${health.voice==='bm_george'?'George':'Lewis'} · British`:'Kokoro · local';el('local-status').lastChild!.textContent=health.available&&health.installed?' LOCAL · ONLINE':' LOCAL · OFFLINE';}
  catch{el('ollama-status').textContent='UNAVAILABLE';el('ollama-dot').dataset.online='false';}finally{healthBusy=false;}
}
void updateMetrics();void updateHealth();setInterval(()=>void updateMetrics(),2000);setInterval(()=>void updateHealth(),10000);
const history:{user:string;text:string;time:number}[]=[];
window.addEventListener('jarvis-transcript',event=>{
  const turn=(event as CustomEvent<{user:string;text:string}>).detail;history.push({...turn,time:Date.now()});if(history.length>10)history.shift();
  const list=el('history-log');list.replaceChildren();
  for(const item of history){const row=document.createElement('article');row.className='history-turn';const time=document.createElement('time');time.textContent=new Date(item.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});row.append(time);for(const [label,text] of [['YOU',item.user],['JARVIS',item.text]]){if(!text)continue;const paragraph=document.createElement('p'),name=document.createElement('b');name.textContent=label+' ';paragraph.append(name,document.createTextNode(text.slice(0,8000)));row.append(paragraph);}list.append(row);}
});
window.addEventListener('jarvis-turn-complete',event=>{const elapsed=(event as CustomEvent<number>).detail;el('turn-time').textContent=Number.isFinite(elapsed)?`${(elapsed/1000).toFixed(1)}s`:'—';});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void updateMetrics();void updateHealth();}});

window.addEventListener('jarvis-network-view',()=>{navigate('system',true);showSystemNetwork(true);networkModule.live();});
