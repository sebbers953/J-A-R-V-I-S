import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProviderKeys } from './providers';
export function loadAssistantConfig(projectRoot: string, env: NodeJS.ProcessEnv = process.env, read: (path: string) => string = path => readFileSync(path,'utf8')): ProviderKeys {
  let file: Record<string,string>={};let state: 'loaded' | 'missing' | 'unreadable'='loaded';
  try { file=parse(read(join(projectRoot,'.env'))); }
  catch(error) { state=(error as NodeJS.ErrnoException).code==='ENOENT'?'missing':'unreadable'; }
  console.info(`[JARVIS] stage=configuration env_file=${state} location=project-root`);
  const select=(name: string)=>{
    const shell=env[name]?.trim();const local=file[name]?.trim();const value=shell || local;
    const source=shell?'environment':local?'env-file':'missing';
    const placeholder=!!value && /^your_.*(?:key|id)_here$/.test(value);
    console.info(`[JARVIS] stage=configuration variable=${name} source=${source} status=${!value?'missing':placeholder?'placeholder':'present'}`);
    return placeholder?undefined:value;
  };
  const keys: ProviderKeys={grok:select('GROK_API_KEY'),fish:select('FISH_AUDIO_API_KEY')};
  const voice=select('FISH_AUDIO_MODEL_ID');
  if(voice) env.FISH_AUDIO_MODEL_ID=voice;else delete env.FISH_AUDIO_MODEL_ID;
  // CloudProviders captures the voice setting before main clears inherited values.
  return keys;
}
