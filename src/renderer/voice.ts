import { encodeWav } from '../audio-wav';
import type { AssistantState, JarvisAPI } from '../shared';
import { nextState, type VoiceEvent } from '../assistant-state';
export function initVoice(api: JarvisAPI | undefined) {
  const el = (id: string) => document.getElementById(id)!;
  const mic = el('microphone') as HTMLButtonElement;
  const send = el('send-voice') as HTMLButtonElement;
  const canvas = el('waveform') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  let state: AssistantState = 'IDLE';
  let stream: MediaStream | null = null;
  let audio: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let recorder: MediaRecorder | null = null;
  let playback: AudioBufferSourceNode | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0; let requesting = false; let configured = false;
  const samples = new Uint8Array(1024);
  const exchanges: { user: string; text: string }[] = [];
  function message(text: string) { el('assistant-message').textContent = text; }
  function transition(event?: VoiceEvent) {
    if (event) state = nextState(state,event);
    for (const id of ['mic-status','voice-state','core-status']) el(id).textContent = state;
    document.body.dataset.voice = state.toLowerCase();
    send.disabled = state !== 'LISTENING';
    mic.setAttribute('aria-pressed',String(state === 'LISTENING'));
    mic.setAttribute('aria-label',state === 'LISTENING' ? 'Mute microphone' : state === 'PROCESSING' || state === 'SPEAKING' ? 'Cancel and mute assistant' : 'Unmute microphone');
  }
  function releaseInput() {
    clearTimeout(timer);
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; if (recorder.state !== 'inactive') recorder.stop(); }
    recorder = null;
    stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null;
    analyser?.disconnect(); analyser = null;
  }
  function cleanup() {
    releaseInput();
    if (playback) { playback.onended = null; try { playback.stop(); } catch { /* Already ended. */ } playback.disconnect(); playback = null; }
    void audio?.close(); audio = null;
    document.body.style.setProperty('--audio-level','0');
  }
  function mute() { generation++; requesting = false; cleanup(); void api?.assistantCancel().catch(()=>{}); transition('mute'); message('Muted. Click the microphone to start a new utterance.'); }
  function transcript(user: string, text: string) {
    exchanges.push({user,text}); if (exchanges.length>3) exchanges.shift();
    el('conversation').replaceChildren();
    for (const turn of exchanges) for (const [name,content] of [['USER',turn.user],['JARVIS',turn.text]]) {
      if (!content) continue;
      const row=document.createElement('p'); const label=document.createElement('b'); label.textContent=`${name}: `;
      row.append(label,document.createTextNode(content)); el('conversation').append(row);
    }
    el('conversation').scrollTop=el('conversation').scrollHeight;
  }
  async function processCapture(blob: Blob, token: number) {
    try {
      const decoded = await audio!.decodeAudioData(await blob.arrayBuffer());
      const bytes = encodeWav(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);
      if (token!==generation) return;
      const result = await api!.assistantTurn(bytes,'audio/wav');
      if (token!==generation) return;
      if (!result.ok) {
        if (result.user) transcript(result.user,'');
        cleanup(); transition('error'); message(result.message); return;
      }
      transcript(result.user,result.text);
      if (!result.audio) { cleanup(); transition('finish'); message(result.warning || 'Voice playback unavailable.'); return; }
      message('AI-generated voice · microphone is off during playback.');
      const binary=atob(result.audio); const bytesOut=Uint8Array.from(binary,c=>c.charCodeAt(0));
      const buffer=await audio!.decodeAudioData(bytesOut.buffer);
      if (token!==generation) return;
      await audio!.resume();
      if (token!==generation) return;
      analyser=audio!.createAnalyser(); analyser.fftSize=1024;
      playback=audio!.createBufferSource(); playback.buffer=buffer; playback.connect(analyser); analyser.connect(audio!.destination);
      playback.onended=()=>{ if(token===generation) { cleanup(); transition('finish'); message('Ready. Click the microphone for your next question.'); } };
      transition('reply'); playback.start();
    } catch {
      if (token!==generation) return;
      cleanup(); transition('error'); message('Audio or connection unavailable. Please try again.');
    }
  }
  function submit() {
    if (state!=='LISTENING' || !recorder || recorder.state==='inactive') return;
    const active=recorder; const token=generation; const mime=active.mimeType;
    active.onstop=()=>{
      if(token!==generation) return;
      const blob=new Blob(chunks,{type:mime});
      releaseInput(); transition('submit'); message('Transcribing locally and processing…'); void processCapture(blob,token);
    };
    clearTimeout(timer); active.stop();
    // Stop accepting microphone samples immediately, including the final recorder callback.
    stream?.getTracks().forEach(track=>{track.onended=null; track.stop();}); stream=null;
  }
  let chunks: Blob[]=[];
  async function start() {
    if(requesting) return;
    if(state==='LISTENING' || state==='PROCESSING' || state==='SPEAKING') { mute(); return; }
    if(!configured) { message('CONFIGURATION REQUIRED'); return; }
    requesting=true; const token=++generation; message('Requesting microphone…');
    try {
      audio=new AudioContext(); await audio.resume();
      const captured=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(token!==generation) { captured.getTracks().forEach(t=>t.stop()); return; }
      stream=captured;
      const mime=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
      if(!mime) throw new Error('Unsupported recorder');
      analyser=audio!.createAnalyser(); analyser.fftSize=1024; audio!.createMediaStreamSource(stream).connect(analyser);
      chunks=[]; recorder=new MediaRecorder(stream,{mimeType:mime});
      recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);};
      recorder.onerror=()=>{ if(token===generation) {cleanup(); transition('error'); message('Microphone recording failed. Please try again.');} };
      stream.getAudioTracks()[0].onended=()=>{if(token===generation) mute();};
      recorder.start(250); transition('start'); message('Speak, then click Send. Click the microphone to mute and discard.');
      timer=setTimeout(submit,45_000);
    } catch(error) {
      if(token!==generation) return;
      cleanup(); transition('error');
      message(error instanceof DOMException && ['NotAllowedError','PermissionDeniedError'].includes(error.name) ? 'MICROPHONE PERMISSION REQUIRED' : 'Microphone unavailable. Check your input device.');
    } finally { if(token===generation) requesting=false; }
  }
  mic.onclick=()=>void start(); send.onclick=submit;
  transition();
  void (async()=>{
    try { configured=!!api && (await api.assistantStatus()).configured; }
    catch { configured=false; }
    message(configured ? 'Click the microphone to speak. Speech and responses stay on-device with Ollama.' : 'CONFIGURATION REQUIRED');
  })();
  let last=0;
  function draw(time=0) {
    requestAnimationFrame(draw); if(document.hidden || time-last<33) return; last=time;
    const ratio=Math.min(devicePixelRatio||1,2),width=canvas.clientWidth,height=canvas.clientHeight;
    if(canvas.width!==width*ratio || canvas.height!==height*ratio) {canvas.width=width*ratio;canvas.height=height*ratio;}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,height);ctx.strokeStyle=analyser?'#5ef5ff':'#1f5365';ctx.lineWidth=1.5;ctx.beginPath();
    let energy=0;
    if(analyser) {analyser.getByteTimeDomainData(samples);samples.forEach((v,i)=>{const x=i/(samples.length-1)*width,y=height/2+(v-128)/128*height*.48; energy+=(v-128)**2; if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});}
    else {ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);}
    ctx.stroke(); document.body.style.setProperty('--audio-level',String(Math.min(1,Math.sqrt(energy/samples.length)/45)));
  }
  draw();window.addEventListener('beforeunload',()=>{generation++;cleanup();void api?.assistantCancel().catch(()=>{});});
}
