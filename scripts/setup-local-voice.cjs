#!/usr/bin/env node
// Installs only local speech dependencies. Never reads or rewrites .env/API keys.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');const fsp=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');
const models=require('./local-voice/models.json');
const setupEnv={...process.env};for(const name of ['GROK_API_KEY','FISH_AUDIO_API_KEY','FISH_AUDIO_MODEL_ID','OPENAI_API_KEY','XAI_API_KEY'])delete setupEnv[name];
const root=process.env.JARVIS_SPEECH_DIR || (process.platform==='darwin'?path.join(os.homedir(),'Library','Application Support','JARVIS','speech'):path.join(os.homedir(),'.local','share','jarvis','speech'));
function run(cmd,args){const result=spawnSync(cmd,args,{stdio:'inherit',env:setupEnv});if(result.error || result.status!==0)throw new Error(`Setup step failed: ${path.basename(cmd)}`);}
function which(name){const result=spawnSync('/usr/bin/which',[name],{encoding:'utf8'});if(result.status!==0)throw new Error(`Missing tool: ${name}`);return result.stdout.trim();}
async function digest(file,algorithm){const hash=crypto.createHash(algorithm);for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function download(model, transfer){
 const destination=path.join(root,'models',model.file);
 if(fs.existsSync(destination) && await digest(destination,model.algorithm)===model.digest){console.log(`Verified ${model.file}`);return;}
 const partial=destination+'.part';
 try {if(transfer)await transfer(model.url,partial);else run('/usr/bin/curl',['--fail','--location','--retry','2','--proto','=https','--proto-redir','=https','--tlsv1.2',model.url,'--output',partial]);
  if(await digest(partial,model.algorithm)!==model.digest)throw new Error(`Checksum verification failed: ${model.file}`);
  await fsp.rename(partial,destination);
 } finally {await fsp.rm(partial,{force:true});}
}
async function main(){
 if(process.platform!=='darwin')throw new Error('Automatic speech setup targets macOS with Homebrew.');
 if(!path.isAbsolute(root))throw new Error('JARVIS_SPEECH_DIR must be absolute.');
 let brew;try{brew=which('brew');}catch{throw new Error('Install Homebrew from https://brew.sh, open a new Terminal, then rerun npm run setup:voice.');}run(brew,['install','whisper.cpp','ffmpeg','python@3.12']);
 const prefix=spawnSync(brew,['--prefix','python@3.12'],{encoding:'utf8'});if(prefix.status!==0)throw new Error('Python setup failed');
 const python=path.join(prefix.stdout.trim(),'bin','python3.12');
 await fsp.mkdir(path.join(root,'models'),{recursive:true,mode:0o700});
 if(!fs.existsSync(path.join(root,'venv','bin','python')))run(python,['-m','venv',path.join(root,'venv')]);
 const runtimePython=path.join(root,'venv','bin','python');
 run(runtimePython,['-m','pip','install','--disable-pip-version-check','kokoro-onnx==0.6.1']);
 for(const model of models)await download(model);
 // Publish readiness last; failures never leave a manifest claiming a complete setup.
 const runtime={version:1,whisper:which('whisper-cli'),ffmpeg:which('ffmpeg'),python:runtimePython};
 const check=await fsp.mkdtemp(path.join(os.tmpdir(),'jarvis-voice-check-'));
 try{
  const phrase='Your local speech systems are ready.';
  const synth=spawnSync(runtimePython,[path.join(__dirname,'local-voice','tts.py'),path.join(root,'models'),path.join(check,'voice.wav'),'bm_george'],{input:phrase,stdio:['pipe','ignore','ignore'],env:setupEnv,timeout:180000});
  if(synth.error || synth.status!==0)throw new Error('Kokoro self-test failed; local voice setup is incomplete.');
  run(runtime.ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y','-i',path.join(check,'voice.wav'),'-ar','16000','-ac','1',path.join(check,'mono.wav')]);
  const stt=spawnSync(runtime.whisper,['-m',path.join(root,'models','ggml-base.en.bin'),'-f',path.join(check,'mono.wav'),'-l','en','-t','4','-otxt','-of',path.join(check,'transcript')],{stdio:'ignore',env:setupEnv,timeout:180000});
  if(stt.error || stt.status!==0 || !/local speech/i.test(await fsp.readFile(path.join(check,'transcript.txt'),'utf8')))throw new Error('Whisper self-test failed; local voice setup is incomplete.');
 }finally{await fsp.rm(check,{recursive:true,force:true});}
 const manifest=path.join(root,'runtime.json');await fsp.writeFile(manifest+'.tmp',JSON.stringify(runtime,null,2),{mode:0o600});await fsp.rename(manifest+'.tmp',manifest);
 console.log('Local speech setup complete. Whisper base.en and Kokoro bm_george are ready. Restart JARVIS.');
}
module.exports={digest,download};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
