import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ProviderKeys } from './providers';
export function loadAssistantConfig(projectRoot: string,env: NodeJS.ProcessEnv=process.env,read: (path:string)=>string=path=>readFileSync(path,'utf8')): ProviderKeys {
  let file: Record<string,string>={};let state='loaded';
  try{file=parse(read(join(projectRoot,'.env')));}catch(error){state=(error as NodeJS.ErrnoException).code==='ENOENT'?'missing':'unreadable';}
  console.info(`[JARVIS] stage=configuration env_file=${state} location=project-root`);
  const select=(name:string)=>{const shell=env[name]?.trim(),local=file[name]?.trim(),value=shell||local;const placeholder=!!value&&/^your_.*key_here$/.test(value);console.info(`[JARVIS] stage=configuration variable=${name} source=${shell?'environment':local?'env-file':'missing'} status=${!value?'missing':placeholder?'placeholder':'present'}`);return placeholder?undefined:value;};
  return {grok:select('GROK_API_KEY'),model:select('GROK_MODEL'),speech:{directory:select('JARVIS_SPEECH_DIR') || (process.platform==='darwin'?join(homedir(),'Library','Application Support','JARVIS','speech'):join(homedir(),'.local','share','jarvis','speech')),script:join(projectRoot,'scripts','local-voice','tts.py'),voice:select('JARVIS_TTS_VOICE') || 'bm_george'}};
}
