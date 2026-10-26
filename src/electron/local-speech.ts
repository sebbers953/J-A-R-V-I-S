import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { tmpdir, cpus } from 'node:os';
export type LocalFailure = 'local_setup_required' | 'local_runtime_failed' | 'timeout' | 'cancelled' | 'invalid_response';
export class LocalSpeechError extends Error {
  constructor(public kind: LocalFailure) { super('Local speech operation failed'); }
}
interface Runtime { version: number; whisper: string; ffmpeg: string; python: string }
export interface LocalSpeechOptions { directory: string; script: string; voice?: string }
export interface SpeechEngine {
  transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string>;
  speak(text: string, signal: AbortSignal): Promise<Uint8Array>;
}
export class LocalSpeech implements SpeechEngine {
  constructor(private options: LocalSpeechOptions) {}
  private async runtime(stage: 'stt' | 'tts'): Promise<Runtime> {
    try {
      if(!isAbsolute(this.options.directory) || !isAbsolute(this.options.script))throw new Error();
      const runtime=JSON.parse(await readFile(join(this.options.directory,'runtime.json'),'utf8')) as Runtime;
      if(runtime.version!==1 || ![runtime.whisper,runtime.ffmpeg,runtime.python].every(p=>typeof p==='string'&&isAbsolute(p)))throw new Error();
      const paths=stage==='stt'?[runtime.whisper,runtime.ffmpeg,join(this.options.directory,'models','ggml-base.en.bin')]:[runtime.python,this.options.script,...['kokoro-v1.0.onnx','voices-v1.0.bin'].map(p=>join(this.options.directory,'models',p))];
      await Promise.all(paths.map(p=>access(p)));
      return runtime;
    } catch { throw new LocalSpeechError('local_setup_required'); }
  }
  async transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string> {
    const runtime=await this.runtime('stt');const directory=await mkdtemp(join(tmpdir(),'jarvis-stt-'));
    try {
      await writeFile(join(directory,'input.wav'),audio,{mode:0o600});
      await runLocal(runtime.ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y','-i',join(directory,'input.wav'),'-ar','16000','-ac','1','-c:a','pcm_s16le',join(directory,'mono.wav')],signal);
      await runLocal(runtime.whisper,['-m',join(this.options.directory,'models','ggml-base.en.bin'),'-f',join(directory,'mono.wav'),'-l','en','-t',String(Math.min(4,cpus().length)),'-otxt','-of',join(directory,'transcript')],signal);
      return (await readFile(join(directory,'transcript.txt'),'utf8')).trim().slice(0,8000);
    } catch(error) { if(error instanceof LocalSpeechError)throw error; throw new LocalSpeechError('local_runtime_failed'); }
    finally { await rm(directory,{recursive:true,force:true}); }
  }
  async speak(text: string, signal: AbortSignal): Promise<Uint8Array> {
    const runtime=await this.runtime('tts');const directory=await mkdtemp(join(tmpdir(),'jarvis-tts-'));
    try {
      const output=join(directory,'speech.wav');
      const voice=this.options.voice || 'bm_george';
      if(!['bm_george','bm_lewis'].includes(voice))throw new LocalSpeechError('local_setup_required');
      await runLocal(runtime.python,[this.options.script,join(this.options.directory,'models'),output,voice],signal,text);
      const bytes=await readFile(output);
      if(bytes.length<44 || bytes.length>20_000_000 || bytes.toString('ascii',0,4)!=='RIFF' || bytes.toString('ascii',8,12)!=='WAVE')throw new LocalSpeechError('invalid_response');
      return bytes;
    } catch(error) { if(error instanceof LocalSpeechError)throw error; throw new LocalSpeechError('local_runtime_failed'); }
    finally { await rm(directory,{recursive:true,force:true}); }
  }
}
export function runLocal(command: string, args: string[], signal: AbortSignal, input?: string): Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new LocalSpeechError('cancelled'));return;}
    // No API credentials, cloud model downloads, raw subprocess output or shell expansion.
    const env: NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,LANG:'en_US.UTF-8',PYTHONNOUSERSITE:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',OMP_NUM_THREADS:'4'};
    const child=spawn(command,args,{env,stdio:['pipe','ignore','ignore'],shell:false});
    let failure: LocalFailure | undefined;let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill=()=>{child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),2000);killTimer.unref();};
    const abort=()=>{failure='cancelled';kill();};signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>{failure='timeout';kill();},180_000);timer.unref();
    const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);signal.removeEventListener('abort',abort);};
    child.once('error',()=>{cleanup();reject(new LocalSpeechError('local_setup_required'));});
    child.once('close',code=>{cleanup();if(failure || code!==0)reject(new LocalSpeechError(failure || 'local_runtime_failed'));else resolve();});
    child.stdin.on('error',()=>{});child.stdin.end(input || '');
  });
}
