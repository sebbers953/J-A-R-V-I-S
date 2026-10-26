// One fixed-text diagnostic request; no microphone, speech engine, or .env edits.
const path=require('node:path');
const {loadAssistantConfig}=require('../dist/electron/electron/config.js');
const {CloudProviders}=require('../dist/electron/electron/providers.js');
const {PERSONALITY}=require('../dist/electron/electron/assistant.js');
const {failureMessage}=require('../dist/electron/electron/diagnostics.js');
(async()=>{
 const keys=loadAssistantConfig(path.resolve(__dirname,'..'));
 if(!keys.grok){console.error('CONFIGURATION REQUIRED: set GROK_API_KEY locally.');process.exitCode=1;return;}
 const provider=new CloudProviders(keys);
 for(const name of ['GROK_API_KEY','XAI_API_KEY','XAI_DEBUG'])delete process.env[name];
 try{
  await provider.respond([{role:'user',content:'Reply with exactly one word: Ready.'}],PERSONALITY,new AbortController().signal);
  console.info('[JARVIS] diagnostic=passed endpoint=/v1/responses response_text=omitted');
 }catch(error){console.error(failureMessage('response',error));process.exitCode=1;}
})().catch(()=>{console.error('Grok diagnostic could not start. Run npm run build and check local configuration.');process.exitCode=1;});
