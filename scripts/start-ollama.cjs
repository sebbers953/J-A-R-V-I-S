// Run in its own Terminal. No app secrets are forwarded to the local daemon.
const {spawn}=require('node:child_process');
const env={...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'};
for(const key of Object.keys(env))if(/API_KEY|TOKEN|SECRET|PASSWORD/i.test(key))delete env[key];
const child=spawn('ollama',['serve'],{stdio:'inherit',shell:false,env});
child.on('error',()=>{console.error('Ollama could not start. Install it with brew install ollama, then rerun npm run start:ollama.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
